import { randomBytes } from 'node:crypto';
import { ID, Query } from 'node-appwrite';
import { isConflictError, listAllRows } from '../shared.js';
import { createMembershipRow } from './memberships.js';
import { canManageRole, setOperatorLabel, syncTenantReadGrants } from './team-access.js';
import { recordScreeningReview, screenTeamAddition } from './identity-check.js';
import { PENDING_REVIEW_STATUS } from './validation.js';

// A pending_review row is listed so the adder sees it, with no explanation of why (Story 7.2).
const LISTED_MEMBERSHIP_STATUSES = ['active', PENDING_REVIEW_STATUS];
const LISTED_WITH_REVOKED_STATUSES = [...LISTED_MEMBERSHIP_STATUSES, 'revoked'];

/**
 * Story 6.3: the only Function action that provisions a *new* Account, and the sole place
 * "distinct Account per tenant relationship" (FR-4/FR-5) is actually enforced end-to-end.
 * Deliberately no invite-email/SMS delivery here (no AC needs it) — the generated password is
 * returned in the response, the same shape admin-users.js's createUser already uses, so a
 * later story that needs delivery can reuse that existing mechanism rather than a new one.
 */
export async function handleAddTeamMember(context) {
  const {
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
  } = context;
  const { name, email, phone, role } = payload;
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

  // Story 7.2: screened before any Account exists, so a failed lookup leaves nothing behind.
  const screening = await screenTeamAddition({
    ...context,
    role,
    candidate: { name, email, phone },
  });
  if (screening.errorResponse) {
    return screening.errorResponse;
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
    status: screening.membershipStatus,
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

  const reviewRecorded = await recordScreeningReview({
    ...context,
    screening,
    addition: {
      membershipId: membershipResult.body.membershipId,
      userId: account.$id,
      tenantId,
      tenantName: tenant.name ?? null,
      name,
      email,
      phone,
      role,
      addedBy: caller.$id,
    },
  });
  // A pending_review Membership gets no access at all until Admin clears it — and the response
  // below is identical either way, so the adder never learns a check happened (FR-12/FR-23).
  const accessGranted =
    screening.membershipStatus !== 'active' ||
    (await grantTeamMemberAccess({ ...context, tenantId, userId: account.$id, role }));
  const setupIncomplete = !reviewRecorded || !accessGranted;

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

/**
 * The access a newly active team member is owed: the `operator` Label, or the Tenant row's read
 * grant for organizer-tier. Shared by addTeamMember and Admin's clearance of a flagged addition
 * (Story 7.2). The Membership is the source of truth and already exists, so a failure here is
 * reported (false) rather than thrown: the Tenant grant is derived and heals on the next team
 * change, and the Label can be set from Admin's Users page.
 */
export async function grantTeamMemberAccess({
  DatabasesCtor,
  UsersCtor,
  adminClient,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  tenantId,
  userId,
  role,
  error,
}) {
  try {
    if (role === 'operator') {
      await setOperatorLabel({ UsersCtor, adminClient, userId, enabled: true });
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
    return true;
  } catch (err) {
    error(`team access setup failed for ${userId}: ${err.message}`);
    return false;
  }
}

/**
 * Story 7.1: the caller's own team, with each member's name/email — Memberships and Accounts are
 * only readable server-side, so the team screen can't assemble this itself. Scoped to the
 * resolved Tenant only (FR-2). `includeRevoked` (Organizer tier only, validation.js) adds revoked
 * members, so a donation's recorder still has a name after they leave (FR-13).
 */
export async function handleListTeamMembers({
  DatabasesCtor,
  UsersCtor,
  adminClient,
  payload,
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
        Query.equal('status', listedStatuses(payload)),
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

function listedStatuses({ includeRevoked }) {
  return includeRevoked === true ? LISTED_WITH_REVOKED_STATUSES : LISTED_MEMBERSHIP_STATUSES;
}
