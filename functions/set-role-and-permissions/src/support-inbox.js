import { Client, Account, Users, TablesDB, Query } from 'node-appwrite';
import { buildClient, verifyAdminCaller, hasValue } from './shared.js';

const ACTIONS = ['listSupportRequests', 'setSupportRequestStatus'];

export const SUPPORT_INBOX_DEFAULT_LIMIT = 25;
export const SUPPORT_INBOX_MAX_LIMIT = 50;

const STATUSES = ['open', 'closed'];

// Appwrite row ids: at most 36 chars of a-z, A-Z, 0-9, period, hyphen and underscore.
const ROW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

/**
 * The Admin support inbox: the only way an Admin lists and closes Support and Dispute requests
 * (the table's sole writer is this Function). Platform data only — nothing here touches a
 * company's Events or Donations (AD-12). Ordered by the system $createdAt so no index beyond
 * Appwrite's own is needed; the status filter is the one the dashboard count already uses.
 *
 * ClientCtor/AccountCtor/UsersCtor/TablesDBCtor are injectable so tests can substitute fakes.
 */
export async function handleSupportInboxRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  UsersCtor = Users,
  TablesDBCtor = TablesDB,
}) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const verified = await verifyAdminCaller({
    req,
    ClientCtor,
    AccountCtor,
    endpoint,
    projectId,
    error,
  });
  if (verified.errorResponse) {
    return res.json(verified.errorResponse.body, verified.errorResponse.status);
  }

  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey || !isInboxConfigured()) {
    error('support inbox: missing execution API key or database/table IDs.');
    return res.json({ error: 'Server misconfiguration' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);
  const { action, ...payload } = JSON.parse(req.bodyRaw);
  const context = {
    payload,
    tablesDB: new TablesDBCtor(adminClient),
    users: new UsersCtor(adminClient),
    error,
  };
  const result =
    action === 'listSupportRequests'
      ? await listSupportRequests(context)
      : await setSupportRequestStatus(context);
  if (result.status === 200) {
    log(`${action} succeeded (by admin ${verified.caller.$id})`);
  }
  return res.json(result.body, result.status);
}

function isInboxConfigured() {
  return [
    process.env.APPWRITE_DATABASE_ID,
    process.env.APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID,
  ].every(hasValue);
}

function badRequest(message) {
  return { status: 400, body: { error: message } };
}

async function listSupportRequests({ payload, tablesDB, users, error }) {
  const query = parseListPayload(payload);
  if (query.errorResponse) {
    return query.errorResponse;
  }
  try {
    const { rows } = await tablesDB.listRows({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId: process.env.APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID,
      queries: listQueries(query),
    });
    const page = rows.slice(0, query.limit);
    const requests = await toRequests({ rows: page, tablesDB, users, error });
    const nextCursor = rows.length > query.limit ? page[page.length - 1].$id : null;
    return { status: 200, body: { success: true, requests, nextCursor } };
  } catch (err) {
    error(`listSupportRequests: query failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to load support requests' } };
  }
}

function parseListPayload({ status, cursor, limit }) {
  if (status !== undefined && !STATUSES.includes(status)) {
    return { errorResponse: badRequest(`status must be one of: ${STATUSES.join(', ')}`) };
  }
  if (cursor !== undefined && cursor !== null && !ROW_ID_PATTERN.test(cursor)) {
    return { errorResponse: badRequest('cursor must be a row id') };
  }
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1)) {
    return { errorResponse: badRequest('limit must be a positive integer') };
  }
  return {
    status,
    cursor: cursor ?? null,
    limit: Math.min(limit ?? SUPPORT_INBOX_DEFAULT_LIMIT, SUPPORT_INBOX_MAX_LIMIT),
  };
}

// One row beyond the page is fetched only to learn whether another page exists.
function listQueries({ status, cursor, limit }) {
  const queries = [Query.orderDesc('$createdAt'), Query.limit(limit + 1)];
  if (status) {
    queries.push(Query.equal('status', [status]));
  }
  return cursor ? [...queries, Query.cursorAfter(cursor)] : queries;
}

async function toRequests({ rows, tablesDB, users, error }) {
  const [senders, tenantNames] = await Promise.all([
    lookupSenders({ users, userIds: distinctValues(rows, 'userId'), error }),
    lookupTenantNames({ tablesDB, tenantIds: tenantIdsMissingName(rows), error }),
  ]);
  return rows.map((row) => toRequest({ row, sender: senders.get(row.userId), tenantNames }));
}

function distinctValues(rows, field) {
  return [...new Set(rows.map((row) => row[field]).filter(hasValue))];
}

function tenantIdsMissingName(rows) {
  return distinctValues(
    rows.filter((row) => !hasValue(row.tenantName)),
    'tenantId',
  );
}

function toRequest({ row, sender, tenantNames }) {
  return {
    id: row.$id,
    type: row.type,
    status: row.status,
    message: row.message,
    createdAt: row.createdAt ?? row.$createdAt,
    tenantId: row.tenantId ?? null,
    tenantName: row.tenantName ?? tenantNames.get(row.tenantId) ?? null,
    contactEmail: row.contactEmail ?? null,
    senderName: sender?.name || null,
    senderEmail: sender?.email ?? null,
  };
}

// Enrichment is a nicety: a failed lookup leaves the fields null and never fails the list.
async function lookupSenders({ users, userIds, error }) {
  if (userIds.length === 0) {
    return new Map();
  }
  try {
    const page = await users.list({
      queries: [Query.equal('$id', userIds), Query.limit(userIds.length)],
    });
    return new Map(page.users.map((user) => [user.$id, user]));
  } catch (err) {
    error(`listSupportRequests: sender lookup failed: ${err.message}`);
    return new Map();
  }
}

async function lookupTenantNames({ tablesDB, tenantIds, error }) {
  const tableId = process.env.APPWRITE_TENANTS_COLLECTION_ID;
  if (tenantIds.length === 0 || !hasValue(tableId)) {
    return new Map();
  }
  try {
    const { rows } = await tablesDB.listRows({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId,
      queries: [Query.equal('$id', tenantIds), Query.limit(tenantIds.length)],
    });
    return new Map(rows.map((tenant) => [tenant.$id, tenant.name]));
  } catch (err) {
    error(`listSupportRequests: tenant lookup failed: ${err.message}`);
    return new Map();
  }
}

/**
 * Only `status` is written: the live table has no closedAt/closedBy columns, and Appwrite
 * rejects a write naming an unknown column.
 */
async function setSupportRequestStatus({ payload, tablesDB, error }) {
  const { requestId, status } = payload;
  if (typeof requestId !== 'string' || !ROW_ID_PATTERN.test(requestId)) {
    return badRequest('requestId must be a row id');
  }
  if (!STATUSES.includes(status)) {
    return badRequest(`status must be one of: ${STATUSES.join(', ')}`);
  }
  try {
    const row = await tablesDB.updateRow({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId: process.env.APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID,
      rowId: requestId,
      data: { status },
    });
    return { status: 200, body: { success: true, request: { id: row.$id, status } } };
  } catch (err) {
    error(`setSupportRequestStatus: update failed for ${requestId}: ${err.message}`);
    return err?.code === 404
      ? { status: 404, body: { error: 'Request not found' } }
      : { status: 502, body: { error: 'Failed to update the request' } };
  }
}

export { ACTIONS as SUPPORT_INBOX_ACTIONS };
