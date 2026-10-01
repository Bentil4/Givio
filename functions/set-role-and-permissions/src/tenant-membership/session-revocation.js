import { Query } from 'node-appwrite';
import { listAllRows } from '../shared.js';

// Enough to diagnose a failed sign-out from the response without echoing every member.
const MAX_REPORTED_FAILURES = 20;

/**
 * Story 8.1 (FR-19): signs every member of a tenant out on every device, so a suspension takes
 * effect now rather than when their sessions expire. Every Membership is included whatever its
 * status — signing out someone already revoked is harmless — and an Account that no longer
 * exists counts as signed out. Never throws; `ok: false` means at least one member may still
 * hold a live session and the caller must not report success.
 */
export async function revokeTenantMemberSessions(context) {
  const { UsersCtor, adminClient, tenantId, error } = context;
  let userIds;
  try {
    userIds = await listTenantUserIds(context);
  } catch (err) {
    error(`revokeTenantMemberSessions (${tenantId}): listing members failed: ${err.message}`);
    return sessionReport([], [{ userId: null, reason: err.message }]);
  }
  const outcomes = await Promise.allSettled(
    userIds.map((userId) => deleteUserSessions({ UsersCtor, adminClient, userId })),
  );
  const failures = collectFailures(userIds, outcomes);
  failures.forEach((f) =>
    error(`revokeTenantMemberSessions (${tenantId}): ${f.userId}: ${f.reason}`),
  );
  return sessionReport(userIds, failures);
}

async function listTenantUserIds({
  DatabasesCtor,
  adminClient,
  databaseId,
  membershipsCollectionId,
  tenantId,
}) {
  const memberships = await listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId,
    tableId: membershipsCollectionId,
    queries: [Query.equal('tenantId', [tenantId])],
  });
  return [...new Set(memberships.map((m) => m.userId))];
}

async function deleteUserSessions({ UsersCtor, adminClient, userId }) {
  try {
    await new UsersCtor(adminClient).deleteSessions({ userId });
  } catch (err) {
    if (err?.code !== 404) {
      throw err;
    }
  }
}

function collectFailures(userIds, outcomes) {
  return outcomes.flatMap((outcome, i) =>
    outcome.status === 'rejected'
      ? [{ userId: userIds[i], reason: outcome.reason?.message ?? String(outcome.reason) }]
      : [],
  );
}

function sessionReport(userIds, failures) {
  return {
    ok: failures.length === 0,
    membersSignedOut: userIds.length - failures.filter((f) => f.userId !== null).length,
    failureCount: failures.length,
    failures: failures.slice(0, MAX_REPORTED_FAILURES),
  };
}
