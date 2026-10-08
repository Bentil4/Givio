import { Client, Account, TablesDB, Query } from 'node-appwrite';
import {
  buildClient,
  verifyAdminCaller,
  hasValue,
  computeEventPermissions,
  listAllRows,
  pageRows,
  samePermissions,
} from './shared.js';
import { createTimeBudget, mapWithConcurrency } from './bounded-work.js';

const ACTIONS = ['recomputeTenantReadGrants'];

export const ORGANIZER_TIER_ROLES = ['super_organizer', 'organizer'];

// Appwrite rejects a `permissions` array longer than 100 entries (the server's array-param
// limit; not stated in the public docs). Each uid takes one read entry.
export const MAX_ROW_PERMISSIONS = 100;

// Parallel row rewrites per sweep: enough to fit a few hundred rows in the time budget without
// flooding the Appwrite API.
const DONATION_WRITE_CONCURRENCY = 10;

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
  const truncated = readUserIds.length > MAX_ROW_PERMISSIONS;
  return {
    permissions: computeEventPermissions(readUserIds.slice(0, MAX_ROW_PERMISSIONS)),
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

function newReport(tenantId) {
  return {
    tenantId,
    eventsUpdated: 0,
    donationsUpdated: 0,
    truncatedEventIds: [],
    timedOut: false,
    remaining: 0,
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
  return { ok: report.failureCount === 0 && !report.timedOut, ...report };
}

/**
 * Brings one Event and its Donations in line with its derived read set. Donations are written
 * first and the Event last, so the Event's own permissions double as the "done" marker: an
 * Event already matching its read set is known to have matching Donations and is skipped, and
 * one whose Donations failed (or ran out of time) is left stale so the next sweep redoes them.
 * `force` fans out to Donations anyway (the backfill — pre-amendment Donations were never kept
 * in line), and `data` is written with the Event (assignOperators' new assignedUserIds).
 */
async function recomputeEventRow({
  event,
  context,
  report,
  error,
  budget,
  force = false,
  ...rest
}) {
  const { permissions, truncated } = boundedPermissions(readUserIdsFor(event, context));
  if (truncated) {
    noteTruncatedEvent({ report, error, event });
  }
  const eventChanged = !samePermissions(event.$permissions, permissions);
  if (!eventChanged && !force && rest.data === undefined) {
    return;
  }
  if (budget.expired()) {
    skipForTimeout(report, 1);
    return;
  }
  const row = { ...rest, event, permissions, report, error, budget };
  if ((eventChanged || force) && !(await rewriteDonations(row))) {
    return;
  }
  if (eventChanged || rest.data !== undefined) {
    await writeEventRow(row);
  }
}

function noteTruncatedEvent({ report, error, event }) {
  error(
    `tenant read grants: event ${event.$id} needs more than ${MAX_ROW_PERMISSIONS} permissions — organizer-tier grants past the limit were dropped`,
  );
  report.truncatedEventIds.push(event.$id);
}

function skipForTimeout(report, count) {
  report.timedOut = true;
  report.remaining += count;
}

/** True when every stale Donation was rewritten — no failure and nothing skipped for time. */
async function rewriteDonations({ DatabasesCtor, adminClient, event, permissions, ...rest }) {
  const { report, error } = rest;
  const { databaseId, donationsTableId } = grantTables();
  if (!hasValue(donationsTableId)) {
    recordFailure(report, error, {
      table: 'donations',
      rowId: event.$id,
      reason: 'APPWRITE_DONATIONS_COLLECTION_ID is not configured',
    });
    return false;
  }
  const before = { failures: report.failureCount, skipped: report.remaining };
  try {
    for await (const donations of pageRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: donationsTableId,
      queries: [Query.equal('eventId', [event.$id])],
    })) {
      await rewriteDonationPage({ DatabasesCtor, adminClient, donations, permissions, ...rest });
      if (report.remaining > before.skipped) {
        break;
      }
    }
  } catch (err) {
    recordFailure(report, error, { table: 'donations', rowId: event.$id, reason: err.message });
  }
  return report.failureCount === before.failures && report.remaining === before.skipped;
}

function rewriteDonationPage({ donations, permissions, ...rest }) {
  const stale = donations.filter((d) => !samePermissions(d.$permissions, permissions));
  return mapWithConcurrency(stale, DONATION_WRITE_CONCURRENCY, (donation) =>
    rewriteDonationRow({ donation, permissions, ...rest }),
  );
}

async function rewriteDonationRow({ DatabasesCtor, adminClient, donation, permissions, ...rest }) {
  const { report, error, budget } = rest;
  if (budget.expired()) {
    skipForTimeout(report, 1);
    return;
  }
  try {
    await new DatabasesCtor(adminClient).updateRow({
      databaseId: grantTables().databaseId,
      tableId: grantTables().donationsTableId,
      rowId: donation.$id,
      data: {},
      permissions,
    });
    report.donationsUpdated += 1;
  } catch (err) {
    recordFailure(report, error, { table: 'donations', rowId: donation.$id, reason: err.message });
  }
}

async function writeEventRow({ DatabasesCtor, adminClient, event, permissions, data, ...rest }) {
  const { report, error } = rest;
  const { databaseId, eventsTableId } = grantTables();
  try {
    await new DatabasesCtor(adminClient).updateRow({
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
export async function recomputeEventReadGrants({
  DatabasesCtor,
  adminClient,
  event,
  data,
  error,
  budget = createTimeBudget(),
}) {
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
  await recomputeEventRow({
    DatabasesCtor,
    adminClient,
    event,
    context,
    report,
    error,
    budget,
    data,
  });
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
  budget = createTimeBudget(),
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
          budget,
          force,
        });
      }
      if (report.timedOut) {
        break;
      }
    }
  } catch (err) {
    recordFailure(report, error, { table: 'events', rowId: tenantId, reason: err.message });
  }

  return finish(report);
}

/**
 * AD-12 (amended 2026-10-07): the sweep for Events with no tenantId (Admin-created,
 * pre-Story-6.2). Each one and its Donations are rewritten to exactly the reads
 * resolveEventReadPermissions derives for it — every assigned uid — dropping the Admin Label
 * grants such rows were created with. Idempotent and never throws, like the tenant sweep.
 */
export async function recomputeLegacyEventReadGrants({
  DatabasesCtor,
  adminClient,
  error,
  budget = createTimeBudget(),
}) {
  const { databaseId, eventsTableId } = grantTables();
  const report = newReport(null);
  try {
    for await (const events of pageRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: eventsTableId,
      queries: [Query.isNull('tenantId')],
    })) {
      await recomputeLegacyEventRows({ DatabasesCtor, adminClient, events, report, error, budget });
      if (report.timedOut) {
        break;
      }
    }
  } catch (err) {
    recordFailure(report, error, { table: 'events', rowId: null, reason: err.message });
  }
  return finish(report);
}

async function recomputeLegacyEventRows({ events, ...rest }) {
  for (const event of events) {
    const context = legacyGrantContext(event);
    await recomputeEventRow({ ...rest, event, context, force: true });
  }
}

/** Grants every assigned uid, with no tenant to check them against — today's legacy rule. */
function legacyGrantContext(event) {
  return {
    tenantId: event.tenantId,
    approved: true,
    activeUserIds: new Set(event.assignedUserIds ?? []),
    organizerUserIds: [],
  };
}

/**
 * Admin-only backfill: `{ action: 'recomputeTenantReadGrants', tenantId? }` re-derives every
 * Event and Donation read grant for one tenant, or for every tenant when tenantId is omitted,
 * always fanning out to Donations. Omitting tenantId also sweeps the Events with no tenant
 * (`legacyEvents` in the response). Safe to re-run; 502 with the report on any failure.
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

  // One budget for the whole backfill: the 30 s limit is per request, not per tenant.
  const budget = createTimeBudget();
  const { tenants, unsweptTenantCount } = await sweepTenants({
    DatabasesCtor,
    adminClient,
    tenantIds,
    budget,
    error,
  });
  const legacyEvents =
    tenantId === undefined && unsweptTenantCount === 0
      ? await recomputeLegacyEventReadGrants({ DatabasesCtor, adminClient, error, budget })
      : null;
  const ok = unsweptTenantCount === 0 && tenants.every((t) => t.ok) && (legacyEvents?.ok ?? true);
  const truncatedEventIds = tenants.flatMap((t) => t.truncatedEventIds);
  const result = {
    success: ok,
    tenants,
    ...(legacyEvents && { legacyEvents }),
    ...(unsweptTenantCount > 0 && { timedOut: true, unsweptTenantCount }),
    ...(truncatedEventIds.length > 0 && { truncatedEventIds }),
  };
  log(
    `recomputeTenantReadGrants (by admin ${caller.$id}): ${tenants.length} tenant(s), ` +
      `${tenants.filter((t) => !t.ok).length} with failures` +
      (unsweptTenantCount > 0 ? `, ${unsweptTenantCount} not reached (out of time)` : '') +
      (truncatedEventIds.length > 0 ? `, ${truncatedEventIds.length} truncated event(s)` : '') +
      (legacyEvents ? `, ${legacyEvents.eventsUpdated} legacy event(s) updated` : ''),
  );
  return res.json(result, ok ? 200 : 502);
}

async function sweepTenants({ tenantIds, budget, ...sweep }) {
  const tenants = [];
  for (const id of tenantIds) {
    if (budget.expired()) {
      break;
    }
    tenants.push(await recomputeTenantReadGrants({ ...sweep, tenantId: id, force: true, budget }));
  }
  return { tenants, unsweptTenantCount: tenantIds.length - tenants.length };
}

/** The response field that makes a silently dropped organizer-tier grant visible to callers. */
export function truncationWarning(grants) {
  return grants.truncatedEventIds.length > 0 ? { truncatedEventIds: grants.truncatedEventIds } : {};
}

export { ACTIONS as TENANT_GRANT_ACTIONS };
