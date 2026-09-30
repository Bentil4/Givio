import { Client, Account, TablesDB, Query } from 'node-appwrite';
import {
  buildClient,
  verifyAdminCaller,
  hasValue,
  computeEventPermissions,
  listAllRows,
  pageRows,
} from './shared.js';

const ACTIONS = ['recomputeTenantReadGrants'];

export const ORGANIZER_TIER_ROLES = ['super_organizer', 'organizer'];

// Appwrite rejects a `permissions` array longer than 100 entries (the server's array-param
// limit; not stated in the public docs). Three go to the Admin Label, so at most 97 uids fit.
export const MAX_ROW_PERMISSIONS = 100;
const MAX_READ_USER_IDS = MAX_ROW_PERMISSIONS - computeEventPermissions([]).length;

// Enough to diagnose a failed sweep from the response without echoing thousands of row ids.
const MAX_REPORTED_FAILURES = 20;

function grantTables() {
  return {
    databaseId: process.env.APPWRITE_DATABASE_ID,
    eventsTableId: process.env.APPWRITE_EVENTS_COLLECTION_ID,
    donationsTableId: process.env.APPWRITE_DONATIONS_COLLECTION_ID,
    tenantsTableId: process.env.APPWRITE_TENANTS_COLLECTION_ID,
    membershipsTableId: process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID,
  };
}

/**
 * Everything the AD-2 read rule needs to know about one tenant: whether it's approved, which
 * uids hold an active Membership in it, and which of those are organizer-tier. A tenant that
 * isn't approved grants nobody, so its Memberships aren't read at all. `tenantStatus` lets a
 * caller that has just written the status (setTenantStatus) skip re-reading it. Throws when a
 * lookup fails or the tenant tables aren't configured — callers must fail closed.
 */
export async function loadTenantGrantContext({
  DatabasesCtor,
  adminClient,
  tenantId,
  tenantStatus,
}) {
  const { databaseId, tenantsTableId, membershipsTableId } = grantTables();
  if (!hasValue(tenantsTableId) || !hasValue(membershipsTableId)) {
    throw new Error(
      'APPWRITE_TENANTS_COLLECTION_ID/APPWRITE_MEMBERSHIPS_COLLECTION_ID are not configured',
    );
  }

  let status = tenantStatus;
  if (status === undefined) {
    const tenant = await new DatabasesCtor(adminClient).getRow({
      databaseId,
      tableId: tenantsTableId,
      rowId: tenantId,
    });
    status = tenant.status;
  }
  if (status !== 'approved') {
    return { tenantId, approved: false, activeUserIds: new Set(), organizerUserIds: [] };
  }

  const memberships = await listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId,
    tableId: membershipsTableId,
    queries: [Query.equal('tenantId', [tenantId]), Query.equal('status', ['active'])],
  });
  // Re-checked in memory so a query filter that didn't apply can never widen the grant.
  const active = memberships.filter((m) => m.tenantId === tenantId && m.status === 'active');
  return {
    tenantId,
    approved: true,
    activeUserIds: new Set(active.map((m) => m.userId)),
    organizerUserIds: active
      .filter((m) => ORGANIZER_TIER_ROLES.includes(m.role))
      .map((m) => m.userId),
  };
}

/**
 * AD-2 (amended 2026-09-30): the one definition of who may read a tenant-owned Event and its
 * Donations — assigned uids holding an active Membership in the Event's tenant, plus every
 * active super_organizer/organizer of that tenant, and nobody at all unless the tenant is
 * approved. Assigned uids come first so a permission-limit cap drops organizer-tier grants
 * before the Operators actually working the Event.
 */
export function readUserIdsFor(event, context) {
  if (!context.approved || event.tenantId !== context.tenantId) {
    return [];
  }
  const assigned = (event.assignedUserIds ?? []).filter((uid) => context.activeUserIds.has(uid));
  return [...new Set([...assigned, ...context.organizerUserIds])];
}

function boundedPermissions(readUserIds) {
  const truncated = readUserIds.length > MAX_READ_USER_IDS;
  return {
    permissions: computeEventPermissions(readUserIds.slice(0, MAX_READ_USER_IDS)),
    truncated,
  };
}

/**
 * The permissions for a row created under one Event (a new Donation), loading its tenant's
 * grant context when it has one. An Event with no tenantId (Admin-created, pre-Story-6.2)
 * keeps today's behavior exactly: every assigned uid, no tenant check, no organizer-tier
 * grants. Throws when the tenant lookup fails — the caller must not write the row.
 */
export async function resolveEventReadPermissions({ DatabasesCtor, adminClient, event }) {
  if (!hasValue(event.tenantId)) {
    return computeEventPermissions(event.assignedUserIds ?? []);
  }
  const context = await loadTenantGrantContext({
    DatabasesCtor,
    adminClient,
    tenantId: event.tenantId,
  });
  return boundedPermissions(readUserIdsFor(event, context)).permissions;
}

function samePermissions(current = [], desired) {
  const a = [...new Set(current)].sort();
  const b = [...new Set(desired)].sort();
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

function newReport(tenantId) {
  return {
    tenantId,
    eventsUpdated: 0,
    donationsUpdated: 0,
    truncatedEventIds: [],
    failureCount: 0,
    failures: [],
  };
}

function recordFailure(report, error, failure) {
  error(
    `tenant read grants (${report.tenantId}): ${failure.table} ${failure.rowId}: ${failure.reason}`,
  );
  report.failureCount += 1;
  if (report.failures.length < MAX_REPORTED_FAILURES) {
    report.failures.push(failure);
  }
}

function finish(report) {
  return { ok: report.failureCount === 0, ...report };
}

/**
 * Brings one Event and its Donations in line with its derived read set. Donations are written
 * first and the Event last, so the Event's own permissions double as the "done" marker: an
 * Event already matching its read set is known to have matching Donations and is skipped, and
 * one whose Donations failed is left stale so the next sweep redoes them. `force` fans out to
 * Donations anyway (the backfill — pre-amendment Donations were never kept in line), and
 * `data` is written with the Event (assignOperators' new assignedUserIds).
 */
async function recomputeEventRow({
  DatabasesCtor,
  adminClient,
  event,
  context,
  report,
  error,
  force = false,
  data,
}) {
  const { databaseId, eventsTableId, donationsTableId } = grantTables();
  const databases = new DatabasesCtor(adminClient);
  const { permissions, truncated } = boundedPermissions(readUserIdsFor(event, context));
  if (truncated) {
    error(
      `tenant read grants: event ${event.$id} needs more than ${MAX_ROW_PERMISSIONS} permissions — organizer-tier grants past the limit were dropped`,
    );
    report.truncatedEventIds.push(event.$id);
  }

  const eventChanged = !samePermissions(event.$permissions, permissions);
  if (!eventChanged && !force && data === undefined) {
    return;
  }

  if (eventChanged || force) {
    if (!hasValue(donationsTableId)) {
      recordFailure(report, error, {
        table: 'donations',
        rowId: event.$id,
        reason: 'APPWRITE_DONATIONS_COLLECTION_ID is not configured',
      });
      return;
    }
    const failuresBefore = report.failureCount;
    try {
      for await (const donations of pageRows({
        DatabasesCtor,
        adminClient,
        databaseId,
        tableId: donationsTableId,
        queries: [Query.equal('eventId', [event.$id])],
      })) {
        for (const donation of donations) {
          if (samePermissions(donation.$permissions, permissions)) {
            continue;
          }
          try {
            await databases.updateRow({
              databaseId,
              tableId: donationsTableId,
              rowId: donation.$id,
              data: {},
              permissions,
            });
            report.donationsUpdated += 1;
          } catch (err) {
            recordFailure(report, error, {
              table: 'donations',
              rowId: donation.$id,
              reason: err.message,
            });
          }
        }
      }
    } catch (err) {
      recordFailure(report, error, { table: 'donations', rowId: event.$id, reason: err.message });
    }
    if (report.failureCount > failuresBefore) {
      return;
    }
  }
  if (!eventChanged && data === undefined) {
    return;
  }

  try {
    await databases.updateRow({
      databaseId,
      tableId: eventsTableId,
      rowId: event.$id,
      data: data ?? {},
      permissions,
    });
    report.eventsUpdated += 1;
  } catch (err) {
    recordFailure(report, error, { table: 'events', rowId: event.$id, reason: err.message });
  }
}

/**
 * One tenant-owned Event (assignOperators): the same recompute the tenant sweep runs, plus the
 * Event's new `data`. Returns the same report shape as recomputeTenantReadGrants.
 */
export async function recomputeEventReadGrants({ DatabasesCtor, adminClient, event, data, error }) {
  const report = newReport(event.tenantId);
  let context;
  try {
    context = await loadTenantGrantContext({
      DatabasesCtor,
      adminClient,
      tenantId: event.tenantId,
    });
  } catch (err) {
    recordFailure(report, error, { table: 'tenants', rowId: event.tenantId, reason: err.message });
    return finish(report);
  }
  await recomputeEventRow({ DatabasesCtor, adminClient, event, context, report, error, data });
  return finish(report);
}

/**
 * Re-derives read permissions on every Event (and its Donations) the tenant owns — the single
 * mechanism behind every AD-2 lifecycle point: membership created/activated, membership
 * revoked, tenant approved, tenant suspended/rejected, and the Admin backfill. Idempotent:
 * rows already matching are not rewritten. Never throws; `ok: false` means at least one row
 * could not be brought in line and the caller must not report success.
 */
export async function recomputeTenantReadGrants({
  DatabasesCtor,
  adminClient,
  tenantId,
  tenantStatus,
  force = false,
  error,
}) {
  const { databaseId, eventsTableId } = grantTables();
  const report = newReport(tenantId);

  let context;
  try {
    context = await loadTenantGrantContext({ DatabasesCtor, adminClient, tenantId, tenantStatus });
  } catch (err) {
    recordFailure(report, error, { table: 'tenants', rowId: tenantId, reason: err.message });
    return finish(report);
  }

  try {
    for await (const events of pageRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: eventsTableId,
      queries: [Query.equal('tenantId', [tenantId])],
    })) {
      for (const event of events) {
        await recomputeEventRow({
          DatabasesCtor,
          adminClient,
          event,
          context,
          report,
          error,
          force,
        });
      }
    }
  } catch (err) {
    recordFailure(report, error, { table: 'events', rowId: tenantId, reason: err.message });
  }

  return finish(report);
}

/**
 * Admin-only backfill: `{ action: 'recomputeTenantReadGrants', tenantId? }` re-derives every
 * Event and Donation read grant for one tenant, or for every tenant when tenantId is omitted,
 * always fanning out to Donations. Safe to re-run; 502 with the per-tenant report on any
 * failure.
 */
export async function handleTenantGrantsRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  DatabasesCtor = TablesDB,
}) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const { databaseId, eventsTableId, donationsTableId, tenantsTableId, membershipsTableId } =
    grantTables();

  const { errorResponse, caller } = await verifyAdminCaller({
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

  let body;
  try {
    body = JSON.parse(req.bodyRaw || '{}');
  } catch {
    return res.json({ error: 'Invalid JSON body' }, 400);
  }
  const { tenantId } = body ?? {};
  if (tenantId !== undefined && !hasValue(tenantId)) {
    return res.json({ error: 'tenantId, when given, must be a non-empty string' }, 400);
  }

  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error(
      "Missing x-appwrite-key — the Function's execution API key scopes are likely misconfigured.",
    );
    return res.json({ error: 'Server misconfiguration: missing execution API key' }, 500);
  }
  if (
    ![databaseId, eventsTableId, donationsTableId, tenantsTableId, membershipsTableId].every(
      hasValue,
    )
  ) {
    error('Missing database/events/donations/tenants/memberships function variables.');
    return res.json({ error: 'Server misconfiguration: missing database/table ID' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);

  let tenantIds = [tenantId];
  if (tenantId === undefined) {
    try {
      const tenants = await listAllRows({
        DatabasesCtor,
        adminClient,
        databaseId,
        tableId: tenantsTableId,
        queries: [],
      });
      tenantIds = tenants.map((t) => t.$id);
    } catch (err) {
      error(`recomputeTenantReadGrants: listing tenants failed: ${err.message}`);
      return res.json({ error: 'Failed to list tenants' }, 502);
    }
  }

  const tenants = [];
  for (const id of tenantIds) {
    tenants.push(
      await recomputeTenantReadGrants({
        DatabasesCtor,
        adminClient,
        tenantId: id,
        force: true,
        error,
      }),
    );
  }

  const ok = tenants.every((t) => t.ok);
  const result = { success: ok, tenants };
  log(
    `recomputeTenantReadGrants (by admin ${caller.$id}): ${tenants.length} tenant(s), ` +
      `${tenants.filter((t) => !t.ok).length} with failures`,
  );
  return res.json(result, ok ? 200 : 502);
}

export { ACTIONS as TENANT_GRANT_ACTIONS };
