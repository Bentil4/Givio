import { ID, Query, Permission, Role } from 'node-appwrite';
import { isConflictError, listAllRows } from '../shared.js';
import { recomputeTenantReadGrants } from '../tenant-grants.js';

// Every action after which a newly active Membership may be owed AD-2 read grants.
const MEMBERSHIP_ACTIVATING_ACTIONS = new Set(['createMembership', 'addTeamMember']);

export async function handleCreateMembership({
  DatabasesCtor,
  UsersCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  error,
}) {
  const { userId, tenantId, role } = payload;
  const databases = new DatabasesCtor(adminClient);

  // Deliberately does NOT require tenant.status === 'approved' — Story 6.4's self-signup flow
  // creates the applicant's own Super Organizer Membership while the Tenant is still
  // 'pending' (the intake step, before Admin's later approval). Existence is still required:
  // a typo'd/garbage tenantId must not create a permanently orphaned Membership.
  try {
    await databases.getRow({ databaseId, tableId: tenantsCollectionId, rowId: tenantId });
  } catch (err) {
    error(`createMembership: tenant ${tenantId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Tenant not found' } };
  }

  // Mirrors rejectNonOperatorIds's existing precedent in event-assignment.js: confirm the
  // target is a real account before writing an association to it.
  try {
    await new UsersCtor(adminClient).get({ userId });
  } catch (err) {
    error(`createMembership: user ${userId} not found: ${err.message}`);
    return { status: 404, body: { error: 'User not found' } };
  }

  // AD-1/FR-4/FR-5's credentials-per-relationship model means one Account never legitimately
  // holds more than one active Membership at a time — Story 6.3's own AC1 states there is "no
  // product surface anywhere that attaches a second tenant's Membership to an existing
  // Account." Enforcing that here (rather than trusting every future caller to check first)
  // is what makes TenantDataService.getMyActiveMembership's "the" active Membership actually
  // well-defined, instead of picking an arbitrary one among duplicates.
  let existingActiveMemberships;
  try {
    existingActiveMemberships = await listAllRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: membershipsCollectionId,
      queries: [Query.equal('userId', [userId]), Query.equal('status', ['active'])],
    });
  } catch (err) {
    error(`createMembership: existing-membership lookup failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to verify existing memberships' } };
  }
  // Not atomic on its own — a concurrent request can pass this same check before either write
  // lands (code review finding). The `userId_unique` index on the memberships table is what
  // actually enforces "at most one Membership row per Account, ever" (per AD-1/FR-4/FR-5); this
  // pre-check just turns the common case into a clean 409 without a wasted createRow attempt.
  if (existingActiveMemberships.length > 0) {
    return { status: 409, body: { error: 'User already holds an active membership' } };
  }

  return createMembershipRow({
    databases,
    databaseId,
    membershipsCollectionId,
    userId,
    tenantId,
    role,
    grantedBy: caller.$id,
    error,
    errorContext: 'createMembership',
  });
}

/**
 * The bare Membership-row write, shared by handleCreateMembership (caller already has a
 * resolved `userId`) and handleAddTeamMember (Story 6.3 — `userId` is a freshly-created
 * Account, so no prior Membership can exist for it, but this stays the single place the
 * row-shape/permissions/conflict-handling is defined either way).
 */
export async function createMembershipRow({
  databases,
  databaseId,
  membershipsCollectionId,
  userId,
  tenantId,
  role,
  grantedBy,
  error,
  errorContext,
  // Story 7.2: a screened addition that matched starts out pending_review instead.
  status = 'active',
  // handleCreateMembership's userId is caller-supplied and can legitimately already hold a
  // Membership (that's the case this message describes). handleAddTeamMember's userId is
  // always a same-call ID.unique() Account, so that message would be nonsensical if this
  // conflict branch somehow fired — override it there instead of reusing a misleading default.
  conflictMessage = 'User already holds an active membership',
}) {
  const now = new Date().toISOString();
  let row;
  try {
    row = await databases.createRow({
      databaseId,
      tableId: membershipsCollectionId,
      rowId: ID.unique(),
      data: { userId, tenantId, role, status, grantedBy, grantedAt: now },
      permissions: [Permission.read(Role.label('admin')), Permission.read(Role.user(userId))],
    });
  } catch (err) {
    if (isConflictError(err)) {
      error(`${errorContext}: userId_unique conflict for ${userId}: ${err.message}`);
      return { status: 409, body: { error: conflictMessage } };
    }
    error(`${errorContext}: createRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to create membership' } };
  }

  return {
    status: 200,
    body: { success: true, membershipId: row.$id, userId, tenantId, role, status },
  };
}

/**
 * Membership activation's hook into AD-2, run once from the dispatcher after the action's own
 * handler so the handlers themselves don't change: a new active organizer-tier member of an
 * approved tenant gains read on its Events and Donations (and a new Operator on any Event it
 * was already assigned to). A pending tenant grants nobody until setTenantStatus approves it.
 * The Membership already exists when this fails, so the action's body (including any
 * generatedPassword) is kept in the 502 — the grant is retried via recomputeTenantReadGrants.
 */
export async function grantTenantReadAfterMembershipWrite({
  action,
  result,
  payload,
  DatabasesCtor,
  adminClient,
  error,
}) {
  if (!MEMBERSHIP_ACTIVATING_ACTIONS.has(action) || result.status !== 200) {
    return result;
  }
  const grants = await recomputeTenantReadGrants({
    DatabasesCtor,
    adminClient,
    // The handler's resolved tenant, not the request's: an Organizer caller never sends one.
    tenantId: result.body?.tenantId ?? payload.tenantId,
    error,
  });
  if (grants.ok) {
    return result;
  }
  return {
    status: 502,
    body: {
      ...result.body,
      success: false,
      error: 'Membership was created, but granting its tenant read access failed',
      grants,
    },
  };
}
