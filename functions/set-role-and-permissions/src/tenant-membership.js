import { randomBytes } from 'node:crypto';
import {
  Client,
  Account,
  Users,
  TablesDB,
  Storage,
  Messaging,
  ID,
  Query,
  Permission,
  Role,
} from 'node-appwrite';
import {
  buildClient,
  verifyAdminCaller,
  verifyCaller,
  VALID,
  invalid,
  hasValue,
  listAllRows,
  isConflictError,
  isValidPhone,
  normalizePhone,
} from './shared.js';
import { sendInviteEmail } from './admin-users.js';
import { recomputeTenantReadGrants } from './tenant-grants.js';

const ACTIONS = [
  'createMembership',
  'revokeMembership',
  'setTenantStatus',
  'addTeamMember',
  'inviteOrganizer',
  'submitTenantApplication',
  'listTeamMembers',
  'recordTenantVerification',
];

// Story 6.4: the one action here a non-Admin reaches — the applicant's own brand-new Account
// submitting their intake.
const SELF_SERVICE_ACTIONS = new Set(['submitTenantApplication']);

// Story 7.1 (FR-10/FR-11): Admin, or an active Organizer-tier member of an approved Tenant acting
// on their own Tenant only. Every other action stays Admin-gated.
const TEAM_ACTIONS = new Set(['addTeamMember', 'revokeMembership', 'listTeamMembers']);

// Which roles each Organizer-tier caller may add or revoke. super_organizer is never a target:
// a Tenant has exactly one, created by inviteOrganizer/submitTenantApplication.
const TEAM_MANAGEABLE_ROLES = {
  super_organizer: ['organizer', 'operator'],
  organizer: ['operator'],
};
const TEAM_MEMBER_ROLES = ['organizer', 'operator'];
const ORGANIZER_TIER_ROLES = ['super_organizer', 'organizer'];
// Story 7.2 adds its pending-review status here.
const LISTED_MEMBERSHIP_STATUSES = ['active'];

// Keep in sync with src/app/data/models/tenant.ts's TENANT_SIZES/TENANT_TYPES — separate
// deployments with no shared module system, same arrangement as VALID_ROLES in shared.js.
export const TENANT_SIZES = ['1-10', '11-50', '51-200', '201+'];
export const TENANT_TYPES = ['funeral', 'wedding', 'funeral_and_wedding', 'other'];
const TENANT_TEXT_MAX = 128;
const MAX_ESTIMATED_USERS = 100000;

// Matches the tenant_documents bucket's own allowed extensions (pdf/jpg/jpeg/png). The bucket
// enforces this at upload; re-checked here because the Function is the one place a file is
// accepted as evidence.
const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

// A self-signup applicant must never be able to choose their own trust state.
const SERVER_OWNED_TENANT_FIELDS = [
  'status',
  'role',
  'superOrganizerId',
  'verifiedBy',
  'verifiedAt',
  'tenantId',
  'userId',
  'createdAt',
];

const MEMBERSHIP_ROLES = ['super_organizer', 'organizer', 'operator'];

const TENANT_STATUSES = ['approved', 'rejected', 'suspended'];

// Deliberately permissive (not RFC 5322) — same "good enough to catch a typo, not a security
// boundary" bar as admin-users.js's isValidPhone; Appwrite's own users.create is still the
// final validator.
// Domain labels exclude '.', so there is only one way to match any input — the earlier
// /^[^\s@]+@[^\s@]+\.[^\s@]+$/ backtracked quadratically on dot-heavy domains (CodeQL
// js/polynomial-redos). The length cap is RFC 5321's maximum.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const EMAIL_MAX_LENGTH = 254;

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email);
}

// Story 6.2's own scope: Tenant creation itself (the initial 'pending' row at self-signup) is
// Story 6.4's job, not this one — so 'pending' is a starting state this Function reads, never
// a transition target this module writes to.
const ALLOWED_TENANT_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
};

const PAYLOAD_VALIDATORS = {
  createMembership: ({ userId, tenantId, role }) => {
    if (!hasValue(userId) || !hasValue(tenantId)) {
      return invalid('Request must include userId and tenantId');
    }
    if (!MEMBERSHIP_ROLES.includes(role)) {
      return invalid(`role must be one of: ${MEMBERSHIP_ROLES.join(', ')}`);
    }
    return VALID;
  },
  revokeMembership: ({ membershipId }) => {
    if (!hasValue(membershipId)) {
      return invalid('Request must include membershipId');
    }
    return VALID;
  },
  setTenantStatus: ({ tenantId, status }) => {
    if (!hasValue(tenantId)) {
      return invalid('Request must include tenantId');
    }
    if (!TENANT_STATUSES.includes(status)) {
      return invalid(`status must be one of: ${TENANT_STATUSES.join(', ')}`);
    }
    return VALID;
  },
  addTeamMember: ({ name, email, tenantId, role }, { isAdmin }) => {
    if (!hasValue(name) || !hasValue(email)) {
      return invalid('Request must include name and email');
    }
    if (isAdmin && !hasValue(tenantId)) {
      return invalid('Request must include tenantId');
    }
    if (!isValidEmail(email)) {
      return invalid('email must be a valid email address');
    }
    if (!TEAM_MEMBER_ROLES.includes(role)) {
      return invalid(`role must be one of: ${TEAM_MEMBER_ROLES.join(', ')}`);
    }
    return VALID;
  },
  listTeamMembers: ({ tenantId }, { isAdmin }) => {
    if (isAdmin && !hasValue(tenantId)) {
      return invalid('Request must include tenantId');
    }
    return VALID;
  },
  inviteOrganizer: ({ name, email, company }) => {
    if (!hasValue(name) || !hasValue(email)) {
      return invalid('Request must include name and email');
    }
    if (!isValidEmail(email)) {
      return invalid('email must be a valid email address');
    }
    return validateCompanyContact(company, { phoneRequired: false });
  },
  recordTenantVerification: ({ tenantId, documentReviewed, phoneVerified }) => {
    if (!hasValue(tenantId)) {
      return invalid('Request must include tenantId');
    }
    if (documentReviewed !== true || phoneVerified !== true) {
      return invalid('Verification needs both the document review and the phone call confirmed');
    }
    return VALID;
  },
  submitTenantApplication: (payload) => {
    const smuggled = SERVER_OWNED_TENANT_FIELDS.filter(
      (field) =>
        field in payload ||
        (typeof payload.company === 'object' &&
          payload.company !== null &&
          field in payload.company),
    );
    if (smuggled.length > 0) {
      return invalid(`Request must not include: ${smuggled.join(', ')}`);
    }
    if (!hasValue(payload.verificationDocumentId)) {
      return invalid('Request must include verificationDocumentId');
    }
    return validateCompanyContact(payload.company, { phoneRequired: true });
  },
};

function validateCompanyIntake(company) {
  if (typeof company !== 'object' || company === null) {
    return invalid('Request must include company');
  }
  const { name, location, size, type, estimatedUserCount } = company;
  for (const [field, value] of [
    ['name', name],
    ['location', location],
  ]) {
    if (!hasValue(value?.trim?.()) || value.trim().length > TENANT_TEXT_MAX) {
      return invalid(`company.${field} is required (max ${TENANT_TEXT_MAX} characters)`);
    }
  }
  if (!TENANT_SIZES.includes(size)) {
    return invalid(`company.size must be one of: ${TENANT_SIZES.join(', ')}`);
  }
  if (!TENANT_TYPES.includes(type)) {
    return invalid(`company.type must be one of: ${TENANT_TYPES.join(', ')}`);
  }
  if (
    !Number.isInteger(estimatedUserCount) ||
    estimatedUserCount < 1 ||
    estimatedUserCount > MAX_ESTIMATED_USERS
  ) {
    return invalid(
      `company.estimatedUserCount must be a whole number from 1 to ${MAX_ESTIMATED_USERS}`,
    );
  }
  return VALID;
}

// contactPhone is checked here rather than in validateCompanyIntake so the approval
// precondition below still passes for applications submitted before the field existed.
function validateCompanyContact(company, { phoneRequired }) {
  const intake = validateCompanyIntake(company);
  if (!intake.valid) {
    return intake;
  }
  const { contactPhone } = company;
  if (contactPhone === undefined || contactPhone === null || contactPhone === '') {
    return phoneRequired ? invalid('company.contactPhone is required') : VALID;
  }
  if (typeof contactPhone !== 'string' || !isValidPhone(normalizePhone(contactPhone))) {
    return invalid(
      'company.contactPhone must be an international phone number, e.g. +233241234567',
    );
  }
  return VALID;
}

/**
 * FR-7's approval precondition: every intake field from the signup wizard is present and
 * valid, including the verification document (FR-8). Story 6.5's approval UI reads the same
 * answer; setTenantStatus enforces it so a direct call can't approve an incomplete intake.
 */
export function isTenantIntakeComplete(tenant) {
  return (
    validateCompanyIntake({
      name: tenant?.name,
      location: tenant?.location,
      size: tenant?.size,
      type: tenant?.type,
      estimatedUserCount: tenant?.estimatedUserCount,
    }).valid && hasValue(tenant?.verificationDocumentId)
  );
}

function companyRowData(company) {
  return {
    name: company.name.trim(),
    location: company.location.trim(),
    size: company.size,
    type: company.type,
    estimatedUserCount: company.estimatedUserCount,
    ...(hasValue(company.contactPhone)
      ? { contactPhone: normalizePhone(company.contactPhone) }
      : {}),
  };
}

function validatePayload(action, payload, callerContext) {
  const validator = PAYLOAD_VALIDATORS[action];
  if (!validator) {
    return invalid(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  return validator(payload ?? {}, callerContext);
}

function isAdminCaller(caller) {
  return (caller.labels ?? []).includes('admin');
}

/**
 * Story 7.1: resolves which Tenant a team action applies to and in what capacity. Admin acts on
 * the payload's tenantId with full access (`callerRole: null`). Anyone else must hold an active
 * super_organizer/organizer Membership in an approved Tenant — the same FR-9 boundary as
 * shared.js's rejectUnapprovedTenantMember, except that having no Membership at all is refused
 * rather than waved through — and the Tenant is always that Membership's, never the client's:
 * a supplied tenantId that differs is refused. Returns `{ tenantId, callerRole, tenant? }` or
 * `{ errorResponse }`.
 */
async function resolveTeamScope({
  DatabasesCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  error,
}) {
  if (isAdminCaller(caller)) {
    return { tenantId: payload.tenantId, callerRole: null };
  }

  const forbidden = { errorResponse: { status: 403, body: { error: 'Forbidden' } } };
  const databases = new DatabasesCtor(adminClient);
  let membership;
  let tenant;
  try {
    const { rows } = await databases.listRows({
      databaseId,
      tableId: membershipsCollectionId,
      queries: [Query.equal('userId', [caller.$id]), Query.limit(1)],
    });
    membership = rows[0];
    if (
      !membership ||
      membership.status !== 'active' ||
      !ORGANIZER_TIER_ROLES.includes(membership.role)
    ) {
      return forbidden;
    }
    tenant = await databases.getRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: membership.tenantId,
    });
  } catch (err) {
    error(`resolveTeamScope: lookup failed for ${caller.$id}: ${err.message}`);
    return { errorResponse: { status: 502, body: { error: 'Failed to verify team access' } } };
  }

  if (tenant.status !== 'approved') {
    return forbidden;
  }
  if (hasValue(payload.tenantId) && payload.tenantId !== membership.tenantId) {
    return forbidden;
  }
  return {
    tenantId: membership.tenantId,
    callerRole: membership.role,
    tenant,
  };
}

function canManageRole(callerRole, targetRole) {
  return callerRole === null || (TEAM_MANAGEABLE_ROLES[callerRole] ?? []).includes(targetRole);
}

/**
 * The Tenant row's read grants, derived from data (AD-2's rule, applied to the Tenant row):
 * Admin plus every active Organizer-tier Membership of that Tenant. Recomputed whenever such a
 * Membership is added or revoked, so concurrent team changes can't clobber each other's grant.
 * Operators get none — they work in /organizer and never read the Tenant row.
 */
async function syncTenantReadGrants({
  DatabasesCtor,
  adminClient,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  tenantId,
}) {
  const members = await listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId,
    tableId: membershipsCollectionId,
    queries: [Query.equal('tenantId', [tenantId]), Query.equal('status', ['active'])],
  });
  const readers = [
    ...new Set(members.filter((m) => ORGANIZER_TIER_ROLES.includes(m.role)).map((m) => m.userId)),
  ];
  await new DatabasesCtor(adminClient).updateRow({
    databaseId,
    tableId: tenantsCollectionId,
    rowId: tenantId,
    data: {},
    permissions: [
      Permission.read(Role.label('admin')),
      ...readers.map((uid) => Permission.read(Role.user(uid))),
    ],
  });
}

/**
 * Operators still sign in through the Label-gated /organizer tier (Story 6.2's known interim
 * gap) and event-assignment.js only assigns Accounts carrying the `operator` Label, so an
 * Operator added here needs it too, and loses it again on revoke.
 */
async function setOperatorLabel({ UsersCtor, adminClient, userId, enabled }) {
  const users = new UsersCtor(adminClient);
  if (enabled) {
    await users.updateLabels({ userId, labels: ['operator'] });
    return;
  }
  const account = await users.get({ userId });
  await users.updateLabels({
    userId,
    labels: (account.labels ?? []).filter((label) => label !== 'operator'),
  });
}

/**
 * Membership revoke's hook into AD-2 (name and call signature kept from Story 6.2 so
 * revokeMembership's call site is unchanged): re-derives read grants on every Event and Donation
 * the tenant owns, which drops the revoked uid wherever it was granted — as an assigned
 * Operator or as an organizer-tier member. assignedUserIds itself is left untouched (AD-2: it
 * stays the record of who was assigned; only the *permission grant* is retracted). `listed`
 * is false when any row could not be brought in line, not only when the listing failed.
 */
async function sweepTenantEventPermissions({ DatabasesCtor, adminClient, tenantId, error }) {
  const grants = await recomputeTenantReadGrants({ DatabasesCtor, adminClient, tenantId, error });
  return { listed: grants.ok, grants };
}

// Every action after which a newly active Membership may be owed AD-2 read grants.
const MEMBERSHIP_ACTIVATING_ACTIONS = new Set(['createMembership', 'addTeamMember']);

/**
 * Membership activation's hook into AD-2, run once from the dispatcher after the action's own
 * handler so the handlers themselves don't change: a new active organizer-tier member of an
 * approved tenant gains read on its Events and Donations (and a new Operator on any Event it
 * was already assigned to). A pending tenant grants nobody until setTenantStatus approves it.
 * The Membership already exists when this fails, so the action's body (including any
 * generatedPassword) is kept in the 502 — the grant is retried via recomputeTenantReadGrants.
 */
async function grantTenantReadAfterMembershipWrite({
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

/**
 * The bare Membership-row write, shared by handleCreateMembership (caller already has a
 * resolved `userId`) and handleAddTeamMember (Story 6.3 — `userId` is a freshly-created
 * Account, so no prior Membership can exist for it, but this stays the single place the
 * row-shape/permissions/conflict-handling is defined either way).
 */
async function createMembershipRow({
  databases,
  databaseId,
  membershipsCollectionId,
  userId,
  tenantId,
  role,
  grantedBy,
  error,
  errorContext,
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
      data: { userId, tenantId, role, status: 'active', grantedBy, grantedAt: now },
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
    body: { success: true, membershipId: row.$id, userId, tenantId, role, status: 'active' },
  };
}

async function handleCreateMembership({
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
 * Story 6.3: the only Function action that provisions a *new* Account, and the sole place
 * "distinct Account per tenant relationship" (FR-4/FR-5) is actually enforced end-to-end.
 * Deliberately no invite-email/SMS delivery here (no AC needs it) — the generated password is
 * returned in the response, the same shape admin-users.js's createUser already uses, so a
 * later story that needs delivery can reuse that existing mechanism rather than a new one.
 */
async function handleAddTeamMember({
  DatabasesCtor,
  UsersCtor,
  adminClient,
  payload,
  caller,
  team,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  error,
}) {
  const { name, email, role } = payload;
  const { tenantId, callerRole } = team;
  const databases = new DatabasesCtor(adminClient);

  // FR-11: an Organizer adding another Organizer is refused here, whatever the UI rendered.
  if (!canManageRole(callerRole, role)) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  // Existence-required, 'pending'-allowed — same as createMembership (Story 6.4's self-signup
  // creates the applicant's own Super Organizer Membership while still 'pending'). Unlike
  // createMembership, this *does* reject 'suspended'/'rejected': those states mean the tenant
  // has no business growing its team, and unlike 'pending' there's no legitimate in-flight
  // flow that needs to add a member to an already-suspended/rejected tenant. Scoped to this
  // action only — createMembership's own (already-shipped, already-tested) behavior is
  // untouched. An Organizer-tier caller's Tenant was already fetched (and required approved)
  // by resolveTeamScope.
  let tenant = team.tenant;
  if (!tenant) {
    try {
      tenant = await databases.getRow({
        databaseId,
        tableId: tenantsCollectionId,
        rowId: tenantId,
      });
    } catch (err) {
      error(`addTeamMember: tenant ${tenantId} not found: ${err.message}`);
      return { status: 404, body: { error: 'Tenant not found' } };
    }
  }
  if (tenant.status === 'suspended' || tenant.status === 'rejected') {
    return { status: 409, body: { error: `Tenant is ${tenant.status}` } };
  }

  // AC1/AC3's crux: create a brand-new Account for this exact call. If `email` already belongs
  // to an existing Account, this throws (Appwrite's own email-uniqueness) *before* any
  // Membership write is even attempted — there is no fallback path that looks up and reuses
  // the existing Account instead, which is what makes the "no product surface attaches a
  // second tenant's Membership to an existing Account" guarantee hold structurally, not just
  // by convention.
  const generatedPassword = randomBytes(12).toString('base64url');
  const users = new UsersCtor(adminClient);
  let account;
  try {
    account = await users.create({
      userId: ID.unique(),
      email,
      password: generatedPassword,
      name,
    });
  } catch (err) {
    if (isConflictError(err)) {
      error(`addTeamMember: email ${email} already registered: ${err.message}`);
      return { status: 409, body: { error: 'A user with this email already exists' } };
    }
    error(`addTeamMember: users.create failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to create user account' } };
  }

  const membershipResult = await createMembershipRow({
    databases,
    databaseId,
    membershipsCollectionId,
    userId: account.$id,
    tenantId,
    role,
    grantedBy: caller.$id,
    error,
    errorContext: 'addTeamMember',
    // The default message ("User already holds an active membership") describes
    // handleCreateMembership's caller-supplied-userId case — nonsensical here, where the
    // userId was minted by this same call and can't have a prior Membership.
    conflictMessage: 'Failed to create membership for newly created account',
  });
  if (membershipResult.status !== 200) {
    // The Account already exists at this point (created above) even though the Membership
    // write failed — no automatic rollback (matches this Function's existing
    // best-effort-on-partial-failure posture elsewhere, e.g. sweepTenantEventPermissions).
    // Code-review fix: without returning userId/generatedPassword here, this Account would be
    // permanently orphaned — its password lost, and a retry with the same email would hit
    // users.create's own conflict branch instead of ever reaching this point again. Returning
    // them lets the caller manually complete the Membership via the existing createMembership
    // action (which takes a userId directly) instead of losing access to the Account entirely.
    error(
      `addTeamMember: account ${account.$id} created but membership write failed — recoverable via createMembership`,
    );
    return {
      status: membershipResult.status,
      body: {
        ...membershipResult.body,
        userId: account.$id,
        generatedPassword,
        recovery: 'Account was created; retry via the createMembership action with this userId.',
      },
    };
  }

  // The Membership is the source of truth and already exists, so a failed access step doesn't
  // fail the add — it's reported as `setupIncomplete` for the caller to surface. The Tenant
  // grant is derived and heals on the next team change; the Label can be set from Admin's
  // Users page.
  let setupIncomplete = false;
  try {
    if (role === 'operator') {
      await setOperatorLabel({ UsersCtor, adminClient, userId: account.$id, enabled: true });
    } else {
      await syncTenantReadGrants({
        DatabasesCtor,
        adminClient,
        databaseId,
        tenantsCollectionId,
        membershipsCollectionId,
        tenantId,
      });
    }
  } catch (err) {
    setupIncomplete = true;
    error(`addTeamMember: access setup failed for ${account.$id}: ${err.message}`);
  }

  return {
    status: 200,
    body: {
      success: true,
      userId: account.$id,
      membershipId: membershipResult.body.membershipId,
      name,
      email,
      tenantId,
      role,
      generatedPassword,
      setupIncomplete,
    },
  };
}

function tenantRowPermissions(superOrganizerId) {
  return [Permission.read(Role.label('admin')), Permission.read(Role.user(superOrganizerId))];
}

/** Undo steps for a multi-write action — each is best-effort and logged, never thrown. */
async function compensate(steps, error, errorContext) {
  const failures = [];
  for (const [label, run] of steps) {
    try {
      await run();
    } catch (err) {
      failures.push(label);
      error(`${errorContext}: compensation "${label}" failed: ${err.message}`);
    }
  }
  return failures;
}

/**
 * Story 6.4, FR-6 path (a): Admin vouches for the company, so the Tenant is written straight to
 * `approved` (verifiedBy/verifiedAt = this Admin, now) with an active super_organizer
 * Membership on a brand-new Account — the same end state path (b) reaches after Story 6.5's
 * approval, so both paths converge on one account shape. Any failure after the Account exists
 * rolls back what was already written rather than leaving a half-provisioned Organizer.
 */
async function handleInviteOrganizer({
  DatabasesCtor,
  UsersCtor,
  MessagingCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  error,
}) {
  const { name, email, company } = payload;
  const databases = new DatabasesCtor(adminClient);
  const users = new UsersCtor(adminClient);
  const generatedPassword = randomBytes(12).toString('base64url');

  let account;
  try {
    account = await users.create({ userId: ID.unique(), email, password: generatedPassword, name });
  } catch (err) {
    if (isConflictError(err)) {
      error(`inviteOrganizer: email ${email} already registered: ${err.message}`);
      return { status: 409, body: { error: 'A user with this email already exists' } };
    }
    error(`inviteOrganizer: users.create failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to create user account' } };
  }

  const now = new Date().toISOString();
  let tenant;
  try {
    tenant = await databases.createRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: ID.unique(),
      data: {
        ...companyRowData(company),
        status: 'approved',
        superOrganizerId: account.$id,
        verifiedBy: caller.$id,
        verifiedAt: now,
        createdAt: now,
      },
      permissions: tenantRowPermissions(account.$id),
    });
  } catch (err) {
    error(`inviteOrganizer: tenant createRow failed: ${err.message}`);
    await compensate(
      [['delete account', () => users.delete({ userId: account.$id })]],
      error,
      'inviteOrganizer',
    );
    return { status: 502, body: { error: 'Failed to create the company' } };
  }

  const membershipResult = await createMembershipRow({
    databases,
    databaseId,
    membershipsCollectionId,
    userId: account.$id,
    tenantId: tenant.$id,
    role: 'super_organizer',
    grantedBy: caller.$id,
    error,
    errorContext: 'inviteOrganizer',
    conflictMessage: 'Failed to create membership for newly created account',
  });
  if (membershipResult.status !== 200) {
    await compensate(
      [
        [
          'delete tenant',
          () =>
            databases.deleteRow({ databaseId, tableId: tenantsCollectionId, rowId: tenant.$id }),
        ],
        ['delete account', () => users.delete({ userId: account.$id })],
      ],
      error,
      'inviteOrganizer',
    );
    return membershipResult;
  }

  // Delivery failure never fails the invite — the Organizer already exists, and the password
  // stays in the response as the Admin's fallback (same contract as admin-users.js createUser).
  const inviteStatus = {
    email: await sendInviteEmail({
      MessagingCtor,
      adminClient,
      userId: account.$id,
      name,
      role: 'Organizer',
      email,
      generatedPassword,
      error,
    }),
  };

  return {
    status: 200,
    body: {
      success: true,
      userId: account.$id,
      tenantId: tenant.$id,
      membershipId: membershipResult.body.membershipId,
      tenantStatus: 'approved',
      generatedPassword,
      inviteStatus,
    },
  };
}

/**
 * Story 6.4, FR-6 path (b) / FR-7: the applicant's own just-created Account submits the
 * wizard's intake. Writes a `pending` Tenant (superOrganizerId = the verified caller, never a
 * client value) plus their active super_organizer Membership. Refuses any caller that already
 * holds a platform relationship — a Label or any Membership row — since FR-4/FR-5 give every
 * tenant relationship its own Account. The document must already sit in the tenant-documents
 * bucket, uploaded by this caller; once accepted it is locked to read-only for the applicant
 * so the evidence Admin reviews can't be swapped or deleted afterwards.
 */
async function handleSubmitTenantApplication({
  DatabasesCtor,
  StorageCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  documentsBucketId,
  error,
}) {
  const { company, verificationDocumentId } = payload;
  const databases = new DatabasesCtor(adminClient);
  const alreadyRelated = { status: 409, body: { error: "We couldn't process this application" } };

  if ((caller.labels ?? []).length > 0) {
    return alreadyRelated;
  }

  let existingMemberships;
  try {
    existingMemberships = await listAllRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: membershipsCollectionId,
      queries: [Query.equal('userId', [caller.$id])],
    });
  } catch (err) {
    error(`submitTenantApplication: membership lookup failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to verify existing memberships' } };
  }
  if (existingMemberships.length > 0) {
    return alreadyRelated;
  }

  const storage = new StorageCtor(adminClient);
  let file;
  try {
    file = await storage.getFile({ bucketId: documentsBucketId, fileId: verificationDocumentId });
  } catch (err) {
    error(`submitTenantApplication: document ${verificationDocumentId} not found: ${err.message}`);
    return { status: 400, body: { error: 'The uploaded document could not be found' } };
  }
  // A client can only grant permissions for roles it holds itself, so update("user:<caller>")
  // on the file means the caller uploaded it (and it hasn't been claimed/locked yet).
  const uploadedByCaller = (file.$permissions ?? []).includes(
    Permission.update(Role.user(caller.$id)),
  );
  if (!uploadedByCaller) {
    return { status: 400, body: { error: 'The uploaded document could not be found' } };
  }
  if (!DOCUMENT_MIME_TYPES.includes(file.mimeType)) {
    return { status: 400, body: { error: 'The document must be a PDF, JPG, or PNG file' } };
  }

  const now = new Date().toISOString();
  let tenant;
  try {
    tenant = await databases.createRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: ID.unique(),
      data: {
        ...companyRowData(company),
        status: 'pending',
        superOrganizerId: caller.$id,
        verificationDocumentId,
        createdAt: now,
      },
      permissions: tenantRowPermissions(caller.$id),
    });
  } catch (err) {
    error(`submitTenantApplication: tenant createRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to submit the application' } };
  }

  const membershipResult = await createMembershipRow({
    databases,
    databaseId,
    membershipsCollectionId,
    userId: caller.$id,
    tenantId: tenant.$id,
    role: 'super_organizer',
    grantedBy: caller.$id,
    error,
    errorContext: 'submitTenantApplication',
  });
  if (membershipResult.status !== 200) {
    await compensate(
      [
        [
          'delete tenant',
          () =>
            databases.deleteRow({ databaseId, tableId: tenantsCollectionId, rowId: tenant.$id }),
        ],
      ],
      error,
      'submitTenantApplication',
    );
    return membershipResult.status === 409 ? alreadyRelated : membershipResult;
  }

  try {
    await storage.updateFile({
      bucketId: documentsBucketId,
      fileId: verificationDocumentId,
      permissions: [Permission.read(Role.label('admin')), Permission.read(Role.user(caller.$id))],
    });
  } catch (err) {
    // Non-fatal: the application is complete; the file just stays applicant-editable.
    error(
      `submitTenantApplication: locking document ${verificationDocumentId} failed: ${err.message}`,
    );
  }

  return {
    status: 200,
    body: {
      success: true,
      tenantId: tenant.$id,
      membershipId: membershipResult.body.membershipId,
      tenantStatus: 'pending',
    },
  };
}

function isTenantVerificationRecorded(tenant) {
  return hasValue(tenant?.verifiedBy) && hasValue(tenant?.verifiedAt);
}

/**
 * Story 6.5 (FR-8): Admin attests that they reviewed the verification document AND completed
 * the phone call — both in one act, so verifiedBy/verifiedAt only ever mean "both checks done".
 * The first attestation stands: a repeat call returns the existing record rather than
 * re-attributing it to whoever clicked last.
 */
async function handleRecordTenantVerification({
  DatabasesCtor,
  StorageCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  tenantsCollectionId,
  documentsBucketId,
  error,
}) {
  const { tenantId } = payload;
  const databases = new DatabasesCtor(adminClient);

  let tenant;
  try {
    tenant = await databases.getRow({ databaseId, tableId: tenantsCollectionId, rowId: tenantId });
  } catch (err) {
    error(`recordTenantVerification: tenant ${tenantId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Tenant not found' } };
  }

  if (tenant.status !== 'pending') {
    return { status: 409, body: { error: `Tenant is already ${tenant.status}` } };
  }
  if (isTenantVerificationRecorded(tenant)) {
    return {
      status: 200,
      body: {
        success: true,
        tenantId,
        verifiedBy: tenant.verifiedBy,
        verifiedAt: tenant.verifiedAt,
      },
    };
  }
  if (!isTenantIntakeComplete(tenant)) {
    return { status: 409, body: { error: 'Tenant intake is incomplete' } };
  }

  try {
    await new StorageCtor(adminClient).getFile({
      bucketId: documentsBucketId,
      fileId: tenant.verificationDocumentId,
    });
  } catch (err) {
    error(
      `recordTenantVerification: document ${tenant.verificationDocumentId} not found: ${err.message}`,
    );
    return { status: 409, body: { error: 'The verification document could not be found' } };
  }

  const verifiedAt = new Date().toISOString();
  try {
    await databases.updateRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: tenantId,
      data: { verifiedBy: caller.$id, verifiedAt },
    });
  } catch (err) {
    error(`recordTenantVerification: updateRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to record the verification' } };
  }

  return { status: 200, body: { success: true, tenantId, verifiedBy: caller.$id, verifiedAt } };
}

async function handleRevokeMembership({
  DatabasesCtor,
  UsersCtor,
  adminClient,
  payload,
  team,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  eventsCollectionId,
  error,
}) {
  const { membershipId } = payload;
  const { callerRole } = team;
  const databases = new DatabasesCtor(adminClient);
  const notFound = { status: 404, body: { error: 'Membership not found' } };

  let membership;
  try {
    membership = await databases.getRow({
      databaseId,
      tableId: membershipsCollectionId,
      rowId: membershipId,
    });
  } catch (err) {
    error(`revokeMembership: membership ${membershipId} not found: ${err.message}`);
    return notFound;
  }

  if (callerRole !== null) {
    // Another tenant's Membership looks exactly like a missing one (FR-2).
    if (membership.tenantId !== team.tenantId) {
      return notFound;
    }
    // An Organizer revokes Operators only; a Super Organizer also revokes Organizers. Neither
    // can revoke the Super Organizer (themself included) — that stays with Admin.
    if (!canManageRole(callerRole, membership.role)) {
      return { status: 403, body: { error: 'Forbidden' } };
    }
  }

  try {
    await databases.updateRow({
      databaseId,
      tableId: membershipsCollectionId,
      rowId: membershipId,
      data: { status: 'revoked' },
    });
  } catch (err) {
    error(`revokeMembership: updateRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to revoke membership' } };
  }

  const sweepResult = await sweepTenantEventPermissions({
    DatabasesCtor,
    adminClient,
    databaseId,
    eventsCollectionId,
    tenantId: membership.tenantId,
    userIds: [membership.userId],
    error,
  });
  if (!sweepResult.listed) {
    // Same fail-closed reasoning as setTenantStatus: the Membership row is already revoked,
    // but the Event-permission sweep couldn't even be attempted — say so rather than 200.
    return {
      status: 502,
      body: {
        error: 'Membership was revoked, but sweeping its Event permissions failed',
        membershipId,
      },
    };
  }

  // Revoking an already-revoked Membership is allowed so a failed step here can be retried.
  try {
    if (membership.role === 'operator') {
      await setOperatorLabel({ UsersCtor, adminClient, userId: membership.userId, enabled: false });
    } else if (ORGANIZER_TIER_ROLES.includes(membership.role)) {
      await syncTenantReadGrants({
        DatabasesCtor,
        adminClient,
        databaseId,
        tenantsCollectionId,
        membershipsCollectionId,
        tenantId: membership.tenantId,
      });
    }
  } catch (err) {
    error(`revokeMembership: removing access for ${membership.userId} failed: ${err.message}`);
    return {
      status: 502,
      body: {
        error: 'Membership was revoked, but removing their remaining access failed',
        membershipId,
      },
    };
  }

  return { status: 200, body: { success: true, membershipId, status: 'revoked' } };
}

/**
 * Story 7.1: the caller's own team, with each member's name/email — Memberships and Accounts are
 * only readable server-side, so the team screen can't assemble this itself. Scoped to the
 * resolved Tenant only (FR-2).
 */
async function handleListTeamMembers({
  DatabasesCtor,
  UsersCtor,
  adminClient,
  caller,
  team,
  databaseId,
  membershipsCollectionId,
  error,
}) {
  const users = new UsersCtor(adminClient);
  try {
    const memberships = await listAllRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: membershipsCollectionId,
      queries: [
        Query.equal('tenantId', [team.tenantId]),
        Query.equal('status', LISTED_MEMBERSHIP_STATUSES),
      ],
    });
    const members = await Promise.all(
      memberships.map(async (m) => {
        const account = await users.get({ userId: m.userId });
        return {
          membershipId: m.$id,
          userId: m.userId,
          name: account.name,
          email: account.email,
          role: m.role,
          status: m.status,
          grantedAt: m.grantedAt,
          isSelf: m.userId === caller.$id,
        };
      }),
    );
    return { status: 200, body: { success: true, tenantId: team.tenantId, members } };
  } catch (err) {
    error(`listTeamMembers: lookup failed for tenant ${team.tenantId}: ${err.message}`);
    return { status: 502, body: { error: 'Failed to load the team' } };
  }
}

async function handleSetTenantStatus({
  DatabasesCtor,
  adminClient,
  payload,
  databaseId,
  tenantsCollectionId,
  eventsCollectionId,
  membershipsCollectionId,
  error,
}) {
  const { tenantId, status } = payload;
  const databases = new DatabasesCtor(adminClient);

  let tenant;
  try {
    tenant = await databases.getRow({ databaseId, tableId: tenantsCollectionId, rowId: tenantId });
  } catch (err) {
    error(`setTenantStatus: tenant ${tenantId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Tenant not found' } };
  }

  const from = tenant.status;
  // A same-status call to a terminal, sweep-bearing status is treated as "retry the sweep",
  // not an illegal no-op transition (code review finding): without this, a tenant whose status
  // write succeeded but whose event sweep then failed (the 502 case below) would be
  // permanently stuck — ALLOWED_TENANT_TRANSITIONS has no outgoing entry for 'suspended' or
  // 'rejected', so the normal transition check would reject every retry attempt.
  const isSweepRetry = from === status && (status === 'suspended' || status === 'rejected');
  if (!isSweepRetry && !(ALLOWED_TENANT_TRANSITIONS[from] ?? []).includes(status)) {
    return {
      status: 400,
      body: { error: `Cannot change tenant status from ${from} to ${status}` },
    };
  }
  if (status === 'approved' && !isTenantIntakeComplete(tenant)) {
    return { status: 409, body: { error: 'Tenant intake is incomplete' } };
  }
  // Story 6.5 (FR-8): the server, not the disabled button, is what makes approval impossible
  // before recordTenantVerification has stamped who verified the application and when.
  if (status === 'approved' && !isTenantVerificationRecorded(tenant)) {
    return {
      status: 409,
      body: { error: 'Record the document review and phone verification before approving' },
    };
  }

  if (!isSweepRetry) {
    try {
      await databases.updateRow({
        databaseId,
        tableId: tenantsCollectionId,
        rowId: tenantId,
        data: { status },
      });
    } catch (err) {
      error(`setTenantStatus: updateRow failed: ${err.message}`);
      return { status: 502, body: { error: 'Failed to change the tenant status' } };
    }
  }

  // AD-2: approval grants every active organizer-tier member read on the tenant's Events and
  // Donations; suspend/reject removes every Membership-derived grant (Family access is by
  // accessCode, AD-10, and is unaffected). A sweep that leaves any row stale reports 502 — the
  // status is already written, and the same call (or recomputeTenantReadGrants) retries it.
  const grants = await recomputeTenantReadGrants({
    DatabasesCtor,
    adminClient,
    tenantId,
    tenantStatus: status,
    error,
  });
  if (!grants.ok) {
    return {
      status: 502,
      body: {
        error: 'Tenant status was changed, but sweeping its Event permissions failed',
        tenantId,
        status,
        grants,
      },
    };
  }

  return { status: 200, body: { success: true, tenantId, status } };
}

/**
 * Story 6.2 (AD-1/AD-9 amended): the sole writer of Memberships, Tenants and Tenant status
 * transitions. Every action is Admin-caller-gated except submitTenantApplication (Story 6.4),
 * which any verified Account may call for itself — the handler then refuses anyone who already
 * holds a platform relationship — and the team actions (Story 7.1), which an Organizer-tier
 * member of an approved Tenant may call for their own Tenant (resolveTeamScope, FR-9/FR-11).
 * Story 7.2 layers IdentityFlags cross-referencing (FR-12/FR-23) onto addTeamMember.
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
  }
  result = await grantTenantReadAfterMembershipWrite({ action, result, ...actionContext });

  if (result.status === 200) {
    // Code-review fix: addTeamMember's success body carries generatedPassword — logging it
    // verbatim would write a new Account's plaintext password into the Function's execution
    // logs. Redact any *Password-suffixed field generically, so a future action returning a
    // similarly-named secret doesn't reopen the same leak.
    const loggableBody = Object.fromEntries(
      Object.entries(result.body).map(([key, value]) =>
        key.toLowerCase().endsWith('password') ? [key, '[redacted]'] : [key, value],
      ),
    );
    log(`${action} succeeded (by ${caller.$id}): ${JSON.stringify(loggableBody)}`);
  }
  return res.json(result.body, result.status);
}

export { ACTIONS as TENANT_MEMBERSHIP_ACTIONS };
