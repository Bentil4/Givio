import { hasValue, isConflictError } from '../shared.js';
import { recomputeTenantReadGrants, truncationWarning } from '../tenant-grants.js';
import { alertAdminsOfFailedSweep } from './sweep-alert.js';
import { identityTables, normalizeIdentity } from './identity-check.js';
import {
  ORGANIZER_TIER_ROLES,
  canManageRole,
  setOperatorLabel,
  syncTenantReadGrants,
} from './team-access.js';
import { FOR_CAUSE_REVOCATION } from './validation.js';

const NOT_FOUND = { status: 404, body: { error: 'Membership not found' } };

const FORBIDDEN = { status: 403, body: { error: 'Forbidden' } };

const FLAGS_MISCONFIGURED = {
  status: 500,
  body: { error: 'Server misconfiguration: missing IdentityFlags table ID' },
};

/**
 * Story 7.3 (FR-13/FR-24): revokes one Membership as either routine offboarding or for-cause.
 * The Membership row flips first, since every access check reads it; then every follow-up step
 * runs even when an earlier one failed, so one failure never leaves the person signed in.
 * Nothing is deleted: the Account, its name and every donation's recordedBy stay as they were.
 * Only a for-cause revoke adds the person to IdentityFlags, which Story 7.2 screens platform-wide.
 * An already-revoked Membership re-runs every step — that is how a 502 here is retried.
 */
export async function handleRevokeMembership(context) {
  const loaded = await loadRevocableMembership(context);
  if (loaded.errorResponse) {
    return loaded.errorResponse;
  }
  if (isForCause(context.payload) && !hasValue(identityTables().flagsTableId)) {
    context.error('revokeMembership: for-cause revoke impossible — IdentityFlags not configured');
    return FLAGS_MISCONFIGURED;
  }
  const revoking = { ...context, membership: loaded.membership };
  if (!(await markMembershipRevoked(revoking))) {
    return { status: 502, body: { error: 'Failed to revoke membership' } };
  }
  return finishRevocation(revoking);
}

function isForCause(payload) {
  return payload.reason === FOR_CAUSE_REVOCATION;
}

async function loadRevocableMembership(context) {
  const { DatabasesCtor, adminClient, databaseId, membershipsCollectionId, payload } = context;
  try {
    const membership = await new DatabasesCtor(adminClient).getRow({
      databaseId,
      tableId: membershipsCollectionId,
      rowId: payload.membershipId,
    });
    return { membership, errorResponse: teamRefusal(context.team, membership) };
  } catch (err) {
    context.error(`revokeMembership: membership ${payload.membershipId} not found: ${err.message}`);
    return { errorResponse: NOT_FOUND };
  }
}

/**
 * An Organizer revokes Operators only; a Super Organizer also revokes Organizers. Neither can
 * revoke the Super Organizer (themself included) — that stays with Admin.
 */
function teamRefusal(team, membership) {
  if (team.callerRole === null) {
    return null;
  }
  // Another tenant's Membership looks exactly like a missing one (FR-2).
  if (membership.tenantId !== team.tenantId) {
    return NOT_FOUND;
  }
  return canManageRole(team.callerRole, membership.role) ? null : FORBIDDEN;
}

async function markMembershipRevoked(context) {
  const { DatabasesCtor, adminClient, databaseId, membershipsCollectionId, membership } = context;
  try {
    await new DatabasesCtor(adminClient).updateRow({
      databaseId,
      tableId: membershipsCollectionId,
      rowId: membership.$id,
      data: { status: 'revoked' },
    });
    return true;
  } catch (err) {
    context.error(`revokeMembership: updateRow failed: ${err.message}`);
    return false;
  }
}

// Sign-in is blocked before sessions end, so no new session can open in between.
const REVOCATION_STEPS = [
  ['event grants', sweepEventGrants],
  ['role access', removeRoleAccess],
  ['sign-in', blockSignIn],
  ['sessions', endSessions],
  ['identity flag', flagForCauseRevocation],
];

async function finishRevocation(context) {
  const failedSteps = [];
  const sweep = {};
  for (const step of REVOCATION_STEPS) {
    if (!(await runRevocationStep({ ...context, sweep }, step))) {
      failedSteps.push(step[0]);
    }
  }
  return failedSteps.length === 0
    ? revokedResponse({ ...context, sweep })
    : incompleteRevocationResponse(context, failedSteps);
}

async function runRevocationStep(context, [name, step]) {
  try {
    await step(context);
    return true;
  } catch (err) {
    const { userId } = context.membership;
    context.error(`revokeMembership: ${name} step failed for ${userId}: ${err.message}`);
    return false;
  }
}

function revokedResponse({ membership, payload, sweep }) {
  return {
    status: 200,
    body: {
      success: true,
      membershipId: membership.$id,
      status: 'revoked',
      reason: payload.reason,
      ...truncationWarning(sweep.grants),
    },
  };
}

function incompleteRevocationResponse({ membership }, failedSteps) {
  return {
    status: 502,
    body: {
      error: 'Access was revoked, but finishing it failed — revoke again to finish',
      membershipId: membership.$id,
      failedSteps,
    },
  };
}

/**
 * AD-2: re-derives the read grants on every Event and Donation the tenant owns, which drops the
 * revoked uid wherever it was granted. assignedUserIds is left untouched — it stays the record of
 * who was assigned; only the permission grant is retracted.
 */
async function sweepEventGrants({ membership, sweep, ...context }) {
  const { tenantId } = membership;
  const { DatabasesCtor, adminClient, error } = context;
  const grants = await recomputeTenantReadGrants({ DatabasesCtor, adminClient, tenantId, error });
  if (!grants.ok) {
    await alertAdminsOfFailedSweep({ ...context, tenantId, grants });
    throw new Error(
      grants.timedOut
        ? 'ran out of time re-deriving Event or Donation grants'
        : 'some Event or Donation grants could not be re-derived',
    );
  }
  sweep.grants = grants;
}

async function removeRoleAccess(context) {
  const { membership } = context;
  if (membership.role === 'operator') {
    await setOperatorLabel({ ...context, userId: membership.userId, enabled: false });
  } else if (ORGANIZER_TIER_ROLES.includes(membership.role)) {
    await syncTenantReadGrants({ ...context, tenantId: membership.tenantId });
  }
}

/**
 * Safe because every tenant relationship has its own Account (FR-4/FR-5): blocking this one
 * never locks the person out of another company. AD-9's defense-in-depth for the Membership.
 */
function blockSignIn({ UsersCtor, adminClient, membership }) {
  return new UsersCtor(adminClient).updateStatus({ userId: membership.userId, status: false });
}

function endSessions({ UsersCtor, adminClient, membership }) {
  return new UsersCtor(adminClient).deleteSessions({ userId: membership.userId });
}

async function flagForCauseRevocation(context) {
  if (!isForCause(context.payload)) {
    return;
  }
  const users = new context.UsersCtor(context.adminClient);
  const account = await users.get({ userId: context.membership.userId });
  await writeIdentityFlagOnce({ ...context, flag: buildForCauseFlag({ ...context, account }) });
}

/** Stored in normalizeIdentity form: Story 7.2's lookup is an exact-equality query on it. */
function buildForCauseFlag({ account, membership, payload }) {
  return {
    ...normalizeIdentity({ name: account.name, email: account.email, phone: account.phone }),
    reason: payload.explanation.trim(),
    flaggedAt: new Date().toISOString(),
    sourceType: 'for_cause_revocation',
    flaggedByTenantId: membership.tenantId,
  };
}

/** Keyed by the Membership, so a retried for-cause revoke never adds a second flag. */
async function writeIdentityFlagOnce({ DatabasesCtor, adminClient, databaseId, membership, flag }) {
  try {
    await new DatabasesCtor(adminClient).createRow({
      databaseId,
      tableId: identityTables().flagsTableId,
      rowId: membership.$id,
      data: flag,
    });
  } catch (err) {
    if (!isConflictError(err)) {
      throw err;
    }
  }
}
