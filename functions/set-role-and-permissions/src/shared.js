import { Permission, Query, Role } from 'node-appwrite';

// Shared by every action module in this Function (admin-users.js, event-assignment.js).
// Keep in sync with src/app/data/services/auth.service.ts's ROLE_LABELS — the two run in
// separate deployments (this Function vs. the Angular app) with no shared module system,
// so there's no way to import one list into the other; update both by hand.
export const VALID_ROLES = ['admin', 'operator'];

export function buildClient(ClientCtor, endpoint, projectId) {
  return new ClientCtor().setEndpoint(endpoint).setProject(projectId);
}

/**
 * Verifies the caller via their JWT (never the spoofable x-appwrite-user-id header) —
 * runs before any action-specific payload parsing/validation, so an unauthenticated or
 * non-admin caller always gets 401/403 first, regardless of what action they asked for.
 */
export async function verifyAdminCaller({
  req,
  ClientCtor,
  AccountCtor,
  endpoint,
  projectId,
  error,
}) {
  const callerJwt = req.headers['x-appwrite-user-jwt'];
  if (!callerJwt) {
    return { errorResponse: { status: 401, body: { error: 'Unauthenticated' } } };
  }

  const callerClient = buildClient(ClientCtor, endpoint, projectId).setJWT(callerJwt);

  let caller;
  try {
    caller = await new AccountCtor(callerClient).get();
  } catch (err) {
    error(`Caller JWT verification failed: ${err.message}`);
    return { errorResponse: { status: 401, body: { error: 'Unauthenticated' } } };
  }

  if (!(caller.labels ?? []).includes('admin')) {
    return { errorResponse: { status: 403, body: { error: 'Forbidden' } } };
  }

  return { caller };
}

/**
 * Same JWT verification as verifyAdminCaller, without the admin-only gate — for actions an
 * Operator may legitimately call (e.g. recording a donation). The caller's own role/assignment
 * is then checked by the action itself, against whatever resource it's acting on.
 */
export async function verifyCaller({ req, ClientCtor, AccountCtor, endpoint, projectId, error }) {
  const callerJwt = req.headers['x-appwrite-user-jwt'];
  if (!callerJwt) {
    return { errorResponse: { status: 401, body: { error: 'Unauthenticated' } } };
  }

  const callerClient = buildClient(ClientCtor, endpoint, projectId).setJWT(callerJwt);

  let caller;
  try {
    caller = await new AccountCtor(callerClient).get();
  } catch (err) {
    error(`Caller JWT verification failed: ${err.message}`);
    return { errorResponse: { status: 401, body: { error: 'Unauthenticated' } } };
  }

  return { caller };
}

export const VALID = { valid: true };

export function invalid(error) {
  return { valid: false, body: { error } };
}

export function hasValue(field) {
  return typeof field === 'string' && field.length > 0;
}

/**
 * Recomputes an Event document's Appwrite permissions from its assignedUserIds (AD-2): Admin
 * keeps full CRUD via the Label; each assigned uid gets read-only document access. Relocated
 * here from event-assignment.js (Story 6.2) so tenant-membership.js's sweep can share it
 * without a circular import between the two action modules. Donation-row permissions aren't
 * touched here — Story 3.1 sets those directly at creation from the assignedUserIds already
 * known at that moment. Known gap: if assignedUserIds ever changes *after* donations already
 * exist for that event, this function does not retroactively rewrite their permissions — a
 * re-assigned/unassigned uid's access to already-existing Donations won't reflect the change
 * until this is extended to do that bulk rewrite too.
 */
export function computeEventPermissions(assignedUserIds) {
  return [
    Permission.read(Role.label('admin')),
    Permission.update(Role.label('admin')),
    Permission.delete(Role.label('admin')),
    ...assignedUserIds.map((userId) => Permission.read(Role.user(userId))),
  ];
}

/**
 * Story 6.2 code review: drains every page of a listRows query instead of only the default
 * first page — without this, any call site filtering a large table (Memberships/Events) by a
 * tenant/membership condition silently misses rows beyond Appwrite's default page size (25).
 * Mirrors the pagination shape already established in EventDataService.fetchAllEventRows
 * (client-side), now shared by every server-side Function module that lists more than a
 * handful of rows.
 */
export async function listAllRows({ DatabasesCtor, adminClient, databaseId, tableId, queries }) {
  const PAGE_SIZE = 100;
  const databases = new DatabasesCtor(adminClient);
  const rows = [];
  let cursor;

  for (;;) {
    const pageQueries = [...queries, Query.limit(PAGE_SIZE)];
    if (cursor) {
      pageQueries.push(Query.cursorAfter(cursor));
    }
    const page = await databases.listRows({ databaseId, tableId, queries: pageQueries });
    rows.push(...page.rows);
    if (page.rows.length < PAGE_SIZE) {
      break;
    }
    cursor = page.rows[page.rows.length - 1].$id;
  }

  return rows;
}
