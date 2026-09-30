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

/** Shared by every module that writes a row protected by a unique-column constraint. */
export function isConflictError(err) {
  return err?.code === 409;
}

/**
 * The Appwrite permissions for an Event or Donation row, given its derived read set (AD-2):
 * Admin keeps full CRUD via the Label; each uid gets read-only access. Who belongs in the read
 * set is tenant-grants.js's readUserIdsFor — this only shapes it. Relocated here from
 * event-assignment.js (Story 6.2) so every module writing either row type shares one shape.
 */
export function computeEventPermissions(readUserIds) {
  return [
    Permission.read(Role.label('admin')),
    Permission.update(Role.label('admin')),
    Permission.delete(Role.label('admin')),
    ...[...new Set(readUserIds)].map((userId) => Permission.read(Role.user(userId))),
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
  const rows = [];
  for await (const page of pageRows({ DatabasesCtor, adminClient, databaseId, tableId, queries })) {
    rows.push(...page);
  }
  return rows;
}

/**
 * The cursor loop behind listAllRows, yielding one page at a time — for fan-outs (a tenant's
 * Donations) too large to hold in memory at once. A failed page throws out of the iteration.
 */
export async function* pageRows({ DatabasesCtor, adminClient, databaseId, tableId, queries }) {
  const PAGE_SIZE = 100;
  const databases = new DatabasesCtor(adminClient);
  let cursor;

  for (;;) {
    const pageQueries = [...queries, Query.limit(PAGE_SIZE)];
    if (cursor) {
      pageQueries.push(Query.cursorAfter(cursor));
    }
    const page = await databases.listRows({ databaseId, tableId, queries: pageQueries });
    yield page.rows;
    if (page.rows.length < PAGE_SIZE) {
      return;
    }
    cursor = page.rows[page.rows.length - 1].$id;
  }
}

/**
 * Story 6.4 (FR-9): the server-side half of the pending-state boundary for every action a
 * non-Admin caller can reach. A caller holding a Membership row may act only while that
 * Membership is active AND its Tenant is `approved` — a pending/rejected/suspended tenant's
 * people are refused here regardless of what the UI shows. A caller with no Membership row at
 * all passes (today's Label-based Operators — see Story 6.2's "Known interim gap"), as does an
 * environment without the tenant tables configured (pre-Story-6.2 deployments). A failed
 * lookup fails closed. Returns `null` when allowed, otherwise a `{ status, body }` response.
 */
export async function rejectUnapprovedTenantMember({
  DatabasesCtor,
  adminClient,
  databaseId,
  caller,
  error,
}) {
  const tenantsCollectionId = process.env.APPWRITE_TENANTS_COLLECTION_ID;
  const membershipsCollectionId = process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
  if ((caller.labels ?? []).includes('admin')) {
    return null;
  }
  if (!hasValue(tenantsCollectionId) || !hasValue(membershipsCollectionId)) {
    return null;
  }

  const forbidden = { status: 403, body: { error: 'Forbidden' } };
  try {
    const databases = new DatabasesCtor(adminClient);
    const { rows } = await databases.listRows({
      databaseId,
      tableId: membershipsCollectionId,
      queries: [Query.equal('userId', [caller.$id]), Query.limit(1)],
    });
    if (rows.length === 0) {
      return null;
    }
    const [membership] = rows;
    if (membership.status !== 'active') {
      return forbidden;
    }
    const tenant = await databases.getRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: membership.tenantId,
    });
    return tenant.status === 'approved' ? null : forbidden;
  } catch (err) {
    error(`rejectUnapprovedTenantMember: lookup failed for ${caller.$id}: ${err.message}`);
    return { status: 502, body: { error: 'Failed to verify tenant access' } };
  }
}
