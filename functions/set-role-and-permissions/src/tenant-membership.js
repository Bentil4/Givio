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
  computeEventPermissions,
  listAllRows,
  isConflictError,
} from './shared.js';
import { sendInviteEmail } from './admin-users.js';

const ACTIONS = [
  'createMembership',
  'revokeMembership',
  'setTenantStatus',
  'addTeamMember',
  'inviteOrganizer',
  'submitTenantApplication',
];

// Story 6.4: the one action here a non-Admin reaches — the applicant's own brand-new Account
// submitting their intake. Every other action stays Admin-gated.
const SELF_SERVICE_ACTIONS = new Set(['submitTenantApplication']);

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
  addTeamMember: ({ name, email, tenantId, role }) => {
    if (!hasValue(name) || !hasValue(email) || !hasValue(tenantId)) {
      return invalid('Request must include name, email, and tenantId');
    }
    if (!isValidEmail(email)) {
      return invalid('email must be a valid email address');
    }
    if (!MEMBERSHIP_ROLES.includes(role)) {
      return invalid(`role must be one of: ${MEMBERSHIP_ROLES.join(', ')}`);
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
    return validateCompanyIntake(company);
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
    return validateCompanyIntake(payload.company);
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
  };
}

function validatePayload(action, payload) {
  const validator = PAYLOAD_VALIDATORS[action];
  if (!validator) {
    return invalid(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  return validator(payload ?? {});
}

/**
 * Retracts the derived Role.user() grant for `userIds` from every Event owned by `tenantId`
 * that currently grants at least one of them — called on both a single Membership revoke
 * (userIds = [that one uid]) and a whole-Tenant suspend/reject (userIds = every currently
 * granted uid across the tenant's Events). assignedUserIds itself is left untouched (AD-2:
 * it stays the record of who was assigned; only the *permission grant* is retracted) — only
 * each affected Event's `permissions` are recomputed to drop the swept uid(s).
 */
async function sweepTenantEventPermissions({
  DatabasesCtor,
  adminClient,
  databaseId,
  eventsCollectionId,
  tenantId,
  userIds,
  error,
}) {
  if (userIds.length === 0) {
    return { listed: true };
  }

  const databases = new DatabasesCtor(adminClient);

  let affectedEvents;
  try {
    affectedEvents = await listAllRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: eventsCollectionId,
      queries: [Query.equal('tenantId', [tenantId]), Query.contains('assignedUserIds', userIds)],
    });
  } catch (err) {
    error(`sweepTenantEventPermissions: listRows failed for tenant ${tenantId}: ${err.message}`);
    return { listed: false };
  }

  const sweptUserIds = new Set(userIds);
  for (const event of affectedEvents) {
    const remainingUserIds = (event.assignedUserIds ?? []).filter((uid) => !sweptUserIds.has(uid));
    try {
      await databases.updateRow({
        databaseId,
        tableId: eventsCollectionId,
        rowId: event.$id,
        data: {},
        permissions: computeEventPermissions(remainingUserIds),
      });
    } catch (err) {
      // Best-effort per-event: one failed sweep must not abort the others (a partially-swept
      // tenant is still strictly safer than an unswept one) — surfaced via `error` for
      // operator visibility, per the Architecture Spine's Deferred operations-envelope note.
      // (Deferred, not patched — see Story 6.2's code-review findings: this matches the
      // Architecture Spine's own explicit Deferred note on the AD-9 Function's ops envelope.)
      error(`sweepTenantEventPermissions: updateRow failed for event ${event.$id}: ${err.message}`);
    }
  }

  return { listed: true };
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
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  error,
}) {
  const { name, email, tenantId, role } = payload;
  const databases = new DatabasesCtor(adminClient);

  // Existence-required, 'pending'-allowed — same as createMembership (Story 6.4's self-signup
  // creates the applicant's own Super Organizer Membership while still 'pending'). Unlike
  // createMembership, this *does* reject 'suspended'/'rejected': those states mean the tenant
  // has no business growing its team, and unlike 'pending' there's no legitimate in-flight
  // flow that needs to add a member to an already-suspended/rejected tenant. Scoped to this
  // action only — createMembership's own (already-shipped, already-tested) behavior is
  // untouched.
  let tenant;
  try {
    tenant = await databases.getRow({ databaseId, tableId: tenantsCollectionId, rowId: tenantId });
  } catch (err) {
    error(`addTeamMember: tenant ${tenantId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Tenant not found' } };
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

async function handleRevokeMembership({
  DatabasesCtor,
  adminClient,
  payload,
  databaseId,
  membershipsCollectionId,
  eventsCollectionId,
  error,
}) {
  const { membershipId } = payload;
  const databases = new DatabasesCtor(adminClient);

  let membership;
  try {
    membership = await databases.getRow({
      databaseId,
      tableId: membershipsCollectionId,
      rowId: membershipId,
    });
  } catch (err) {
    error(`revokeMembership: membership ${membershipId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Membership not found' } };
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

  return { status: 200, body: { success: true, membershipId, status: 'revoked' } };
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

  if (status === 'suspended' || status === 'rejected') {
    // Every one of this tenant's Events loses every currently-granted uid — not a
    // targeted-by-uid sweep (that's sweepTenantEventPermissions's job for a single
    // Membership revoke), so this lists and clears the tenant's Events directly rather than
    // computing a uid list and re-querying by it (avoids a redundant round trip, and means
    // there is exactly one place this can fail, not two).
    let tenantEvents;
    try {
      tenantEvents = await listAllRows({
        DatabasesCtor,
        adminClient,
        databaseId,
        tableId: eventsCollectionId,
        queries: [Query.equal('tenantId', [tenantId])],
      });
    } catch (err) {
      error(`setTenantStatus: listing tenant's events failed: ${err.message}`);
      // Story 6.2 code review (fail-closed, not fail-open): the tenant's status row was
      // already written above, but the sweep could not even be attempted — report that
      // honestly rather than a 200 that implies every Event grant was revoked.
      return {
        status: 502,
        body: {
          error: 'Tenant status was changed, but sweeping its Event permissions failed',
          tenantId,
          status,
        },
      };
    }

    for (const event of tenantEvents) {
      try {
        await databases.updateRow({
          databaseId,
          tableId: eventsCollectionId,
          rowId: event.$id,
          data: {},
          permissions: computeEventPermissions([]),
        });
      } catch (err) {
        // Deferred, not patched — matches sweepTenantEventPermissions's own per-event
        // best-effort behavior and the Architecture Spine's Deferred ops-envelope note.
        error(`setTenantStatus: updateRow failed for event ${event.$id}: ${err.message}`);
      }
    }
  }

  return { status: 200, body: { success: true, tenantId, status } };
}

/**
 * Story 6.2 (AD-1/AD-9 amended): the sole writer of Memberships, Tenants and Tenant status
 * transitions. Every action is Admin-caller-gated except submitTenantApplication (Story 6.4),
 * which any verified Account may call for itself — the handler then refuses anyone who already
 * holds a platform relationship. Epic 7 layers an Organizer-caller (FR-11's
 * super_organizer-only gate) plus IdentityFlags cross-referencing (FR-12/FR-23) on top of
 * createMembership later; any such Organizer-callable action must also pass
 * shared.js's rejectUnapprovedTenantMember (FR-9).
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

  const verify = SELF_SERVICE_ACTIONS.has(action) ? verifyCaller : verifyAdminCaller;
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
  if (body === undefined) {
    return res.json({ error: 'Invalid JSON body' }, 400);
  }

  const validation = validatePayload(action, payload);
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
  if (action === 'submitTenantApplication' && !hasValue(documentsBucketId)) {
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
  }

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
