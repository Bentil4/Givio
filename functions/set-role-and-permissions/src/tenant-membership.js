import { Client, Account, Users, TablesDB, Storage, Messaging } from 'node-appwrite';
import { buildClient, verifyAdminCaller, verifyCaller, hasValue } from './shared.js';
import { loggableSummary } from './log-summary.js';
import { validatePayload } from './tenant-membership/validation.js';
import { isAdminCaller, resolveTeamScope } from './tenant-membership/team-access.js';
import {
  handleCreateMembership,
  grantTenantReadAfterMembershipWrite,
} from './tenant-membership/memberships.js';
import { handleAddTeamMember, handleListTeamMembers } from './tenant-membership/team-members.js';
import { handleRevokeMembership } from './tenant-membership/revocation.js';
import {
  handleListIdentityReviews,
  handleResolveIdentityReview,
} from './tenant-membership/identity-reviews.js';
import {
  handleSetTenantStatus,
  handleRecordTenantVerification,
} from './tenant-membership/tenant-lifecycle.js';
import {
  handleInviteOrganizer,
  handleSubmitTenantApplication,
} from './tenant-membership/onboarding.js';
import {
  handleSuspendTenant,
  handleDesignateSuperOrganizer,
  handleGetMyTenantStatus,
} from './tenant-membership/tenant-admin.js';
import { handleUpdateCompanyProfile } from './tenant-membership/company-profile.js';

export {
  ACTIONS as TENANT_MEMBERSHIP_ACTIONS,
  TENANT_SIZES,
  TENANT_TYPES,
  isTenantIntakeComplete,
} from './tenant-membership/validation.js';

// Story 6.4: the one action here a non-Admin reaches — the applicant's own brand-new Account
// submitting their intake. Story 9.2: getMyTenantStatus reads only the caller's own tenant.
const SELF_SERVICE_ACTIONS = new Set(['submitTenantApplication', 'getMyTenantStatus']);

// Story 7.1 (FR-10/FR-11): Admin, or an active Organizer-tier member of an approved Tenant acting
// on their own Tenant only. Every other action stays Admin-gated. updateCompanyProfile shares the
// scope; its handler then admits only the Super Organizer.
const TEAM_ACTIONS = new Set([
  'addTeamMember',
  'revokeMembership',
  'listTeamMembers',
  'updateCompanyProfile',
]);

/**
 * Story 6.2 (AD-1/AD-9 amended): the sole writer of Memberships, Tenants and Tenant status
 * transitions. Every action is Admin-caller-gated except submitTenantApplication (Story 6.4),
 * which any verified Account may call for itself — the handler then refuses anyone who already
 * holds a platform relationship — and the team actions (Story 7.1), which an Organizer-tier
 * member of an approved Tenant may call for their own Tenant (resolveTeamScope, FR-9/FR-11).
 * Story 7.2 layers IdentityFlags cross-referencing (FR-12/FR-23) onto addTeamMember, plus
 * Admin's listIdentityReviews/resolveIdentityReview for the flagged-additions queue. Story 7.3
 * makes revokeMembership state routine vs for-cause; for-cause feeds IdentityFlags (FR-24).
 *
 * ClientCtor/AccountCtor/UsersCtor/DatabasesCtor/StorageCtor/MessagingCtor are injectable so
 * tests can substitute fakes without module-mocking node-appwrite.
 */
export async function handleTenantMembershipRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  UsersCtor = Users,
  DatabasesCtor = TablesDB,
  StorageCtor = Storage,
  MessagingCtor = Messaging,
}) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const databaseId = process.env.APPWRITE_DATABASE_ID;
  const eventsCollectionId = process.env.APPWRITE_EVENTS_COLLECTION_ID;
  const tenantsCollectionId = process.env.APPWRITE_TENANTS_COLLECTION_ID;
  const membershipsCollectionId = process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
  const documentsBucketId = process.env.APPWRITE_TENANT_DOCUMENTS_BUCKET_ID;

  let body;
  try {
    body = JSON.parse(req.bodyRaw || '{}');
  } catch {
    body = undefined;
  }
  const { action, ...payload } = body ?? {};

  const verify =
    SELF_SERVICE_ACTIONS.has(action) || TEAM_ACTIONS.has(action) ? verifyCaller : verifyAdminCaller;
  const { errorResponse, caller } = await verify({
    req,
    ClientCtor,
    AccountCtor,
    endpoint,
    projectId,
    error,
  });
  if (errorResponse) {
    return res.json(errorResponse.body, errorResponse.status);
  }
  // Organizer-tier Accounts carry no Label, so a non-Admin Label marks an Operator-tier Account
  // (legacy or team-added), which manages no one. Refused before anything else is checked.
  const isAdmin = isAdminCaller(caller);
  if (TEAM_ACTIONS.has(action) && !isAdmin && (caller.labels ?? []).length > 0) {
    return res.json({ error: 'Forbidden' }, 403);
  }
  if (body === undefined) {
    return res.json({ error: 'Invalid JSON body' }, 400);
  }

  const validation = validatePayload(action, payload, { isAdmin });
  if (!validation.valid) {
    return res.json(validation.body, 400);
  }

  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error(
      "Missing x-appwrite-key — the Function's execution API key scopes are likely misconfigured.",
    );
    return res.json({ error: 'Server misconfiguration: missing execution API key' }, 500);
  }

  if (
    !hasValue(databaseId) ||
    !hasValue(eventsCollectionId) ||
    !hasValue(tenantsCollectionId) ||
    !hasValue(membershipsCollectionId)
  ) {
    error(
      'Missing APPWRITE_DATABASE_ID/APPWRITE_EVENTS_COLLECTION_ID/APPWRITE_TENANTS_COLLECTION_ID/APPWRITE_MEMBERSHIPS_COLLECTION_ID function variables.',
    );
    return res.json({ error: 'Server misconfiguration: missing database/collection ID' }, 500);
  }
  if (
    (action === 'submitTenantApplication' || action === 'recordTenantVerification') &&
    !hasValue(documentsBucketId)
  ) {
    error('Missing APPWRITE_TENANT_DOCUMENTS_BUCKET_ID function variable.');
    return res.json({ error: 'Server misconfiguration: missing document bucket ID' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);
  const actionContext = {
    DatabasesCtor,
    UsersCtor,
    StorageCtor,
    MessagingCtor,
    adminClient,
    payload,
    caller,
    databaseId,
    eventsCollectionId,
    tenantsCollectionId,
    membershipsCollectionId,
    documentsBucketId,
    error,
  };

  if (TEAM_ACTIONS.has(action)) {
    const team = await resolveTeamScope(actionContext);
    if (team.errorResponse) {
      return res.json(team.errorResponse.body, team.errorResponse.status);
    }
    actionContext.team = team;
  }

  let result;
  switch (action) {
    case 'createMembership':
      result = await handleCreateMembership(actionContext);
      break;
    case 'revokeMembership':
      result = await handleRevokeMembership(actionContext);
      break;
    case 'setTenantStatus':
      result = await handleSetTenantStatus(actionContext);
      break;
    case 'addTeamMember':
      result = await handleAddTeamMember(actionContext);
      break;
    case 'inviteOrganizer':
      result = await handleInviteOrganizer(actionContext);
      break;
    case 'submitTenantApplication':
      result = await handleSubmitTenantApplication(actionContext);
      break;
    case 'listTeamMembers':
      result = await handleListTeamMembers(actionContext);
      break;
    case 'recordTenantVerification':
      result = await handleRecordTenantVerification(actionContext);
      break;
    case 'listIdentityReviews':
      result = await handleListIdentityReviews(actionContext);
      break;
    case 'resolveIdentityReview':
      result = await handleResolveIdentityReview(actionContext);
      break;
    case 'suspendTenant':
      result = await handleSuspendTenant(actionContext);
      break;
    case 'designateSuperOrganizer':
      result = await handleDesignateSuperOrganizer(actionContext);
      break;
    case 'getMyTenantStatus':
      result = await handleGetMyTenantStatus(actionContext);
      break;
    case 'updateCompanyProfile':
      result = await handleUpdateCompanyProfile(actionContext);
      break;
  }
  result = await grantTenantReadAfterMembershipWrite({ action, result, ...actionContext });

  if (result.status === 200) {
    log(`${action} succeeded (by ${caller.$id}): ${JSON.stringify(loggableSummary(result.body))}`);
  }
  return res.json(result.body, result.status);
}
