import { Client, Account, TablesDB, Query } from 'node-appwrite';
import { buildClient, verifyCaller, hasValue } from './shared.js';
import { resolveOrganizerTenant } from './tenant-events/organizer-scope.js';

const ACTIONS = ['listTenantAuditLog'];

export const TENANT_AUDIT_PAGE_SIZE = 50;

const FORBIDDEN = { status: 403, body: { error: 'Forbidden' } };

// Appwrite row ids: at most 36 chars of a-z, A-Z, 0-9, period, hyphen and underscore.
const ROW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

/**
 * Story 7.5 (FR-15): a Super Organizer's read of their own tenant's audit trail. audit_logs rows
 * stay Admin-read-only, so this Function is the only way a tenant reads them: the Tenant comes
 * from the caller's own active super_organizer Membership in an approved Tenant (never the
 * client — a payload tenantId that differs is refused), and the API-key query is filtered by
 * that tenantId, so another tenant's entries are unreachable even by calling the API directly.
 * One cursor-paginated page per call, newest first.
 *
 * ClientCtor/AccountCtor/DatabasesCtor are injectable so tests can substitute fakes.
 */
export async function handleTenantAuditRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  DatabasesCtor = TablesDB,
}) {
  const request = await prepareRequest({ req, ClientCtor, AccountCtor, DatabasesCtor, error });
  if (request.errorResponse) {
    return res.json(request.errorResponse.body, request.errorResponse.status);
  }
  const result = await listTenantAuditPage({ ...request, DatabasesCtor, error });
  if (result.status === 200) {
    log(`listTenantAuditLog succeeded (by super organizer ${request.caller.$id})`);
  }
  return res.json(result.body, result.status);
}

async function prepareRequest({ req, ClientCtor, AccountCtor, DatabasesCtor, error }) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const verified = await verifyCaller({ req, ClientCtor, AccountCtor, endpoint, projectId, error });
  if (verified.errorResponse) {
    return verified;
  }
  // Only a label-less Organizer-tier Account can be a Super Organizer — refused before the
  // payload is read, like every other caller gate in this Function.
  if ((verified.caller.labels ?? []).length > 0) {
    return { errorResponse: FORBIDDEN };
  }
  const payload = parsePayload(req.bodyRaw);
  if (payload.errorResponse) {
    return payload;
  }
  const adminClient = buildAdminClient({ req, ClientCtor, endpoint, projectId, error });
  if (adminClient.errorResponse) {
    return adminClient;
  }
  return scopeToCallerTenant({
    DatabasesCtor,
    adminClient,
    payload,
    caller: verified.caller,
    error,
  });
}

function buildAdminClient({ req, ClientCtor, endpoint, projectId, error }) {
  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey || !hasValue(process.env.APPWRITE_AUDIT_LOGS_COLLECTION_ID)) {
    error('listTenantAuditLog: missing execution API key or audit_logs table ID.');
    return { errorResponse: { status: 500, body: { error: 'Server misconfiguration' } } };
  }
  return buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);
}

async function scopeToCallerTenant(context) {
  const scope = await resolveSuperOrganizerTenant(context);
  if (scope.errorResponse) {
    return scope;
  }
  const { payload, adminClient, caller } = context;
  return { ...payload, tenantId: scope.tenantId, adminClient, caller };
}

function parsePayload(bodyRaw) {
  let body;
  try {
    body = JSON.parse(bodyRaw || '{}');
  } catch {
    return badRequest('Invalid JSON body');
  }
  const { cursor, tenantId } = body ?? {};
  if (cursor !== undefined && cursor !== null && !isRowId(cursor)) {
    return badRequest('cursor must be a row id');
  }
  return { cursor: cursor ?? null, tenantId };
}

function isRowId(value) {
  return typeof value === 'string' && ROW_ID_PATTERN.test(value);
}

function badRequest(error) {
  return { errorResponse: { status: 400, body: { error } } };
}

/**
 * FR-15 names the Super Organizer as the tenant's audit reader: a co-Organizer is refused like
 * any other non-owner, so the trail of what co-Organizers did stays with the account that
 * answers for the tenant. Labelled Accounts (Admin, Operators) never reach here — Admin reads
 * the platform-wide log directly.
 */
async function resolveSuperOrganizerTenant(context) {
  const scope = await resolveOrganizerTenant(context);
  if (scope.errorResponse) {
    return scope;
  }
  return scope.callerRole === 'super_organizer' ? scope : { errorResponse: FORBIDDEN };
}

async function listTenantAuditPage({ DatabasesCtor, adminClient, tenantId, cursor, error }) {
  try {
    const { rows } = await new DatabasesCtor(adminClient).listRows({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId: process.env.APPWRITE_AUDIT_LOGS_COLLECTION_ID,
      queries: tenantAuditQueries(tenantId, cursor),
    });
    return { status: 200, body: { success: true, ...toPage(rows, tenantId) } };
  } catch (err) {
    error(`listTenantAuditLog: query failed for tenant ${tenantId}: ${err.message}`);
    return { status: 502, body: { error: 'Failed to load the activity log' } };
  }
}

// One row beyond the page is fetched only to learn whether another page exists.
function tenantAuditQueries(tenantId, cursor) {
  const queries = [
    Query.equal('tenantId', [tenantId]),
    Query.orderDesc('timestamp'),
    Query.limit(TENANT_AUDIT_PAGE_SIZE + 1),
  ];
  return cursor ? [...queries, Query.cursorAfter(cursor)] : queries;
}

// Re-checked in memory so a query filter that didn't apply can never widen what is returned.
function toPage(rows, tenantId) {
  const ownRows = rows.filter((row) => row.tenantId === tenantId);
  const entries = ownRows.slice(0, TENANT_AUDIT_PAGE_SIZE).map(toAuditRow);
  const hasMore = ownRows.length > TENANT_AUDIT_PAGE_SIZE;
  return { entries, nextCursor: hasMore ? entries[entries.length - 1].$id : null };
}

function toAuditRow(row) {
  return {
    $id: row.$id,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    performedBy: row.performedBy,
    previousValues: row.previousValues,
    newValues: row.newValues,
    timestamp: row.timestamp,
  };
}

export { ACTIONS as TENANT_AUDIT_ACTIONS };
