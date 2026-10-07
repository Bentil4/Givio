import { Client, Account, TablesDB, Query } from 'node-appwrite';
import { buildClient, verifyAdminCaller, hasValue } from './shared.js';
import { QUEUED_REVIEW_STATUSES } from './tenant-membership/identity-reviews.js';
import { OPEN_FLAG_STATUS } from './duplicate-events/flag-store.js';

// Each action counts its own set of queues; the same Admin gate and row-free count for both.
const COUNTED_QUEUES = {
  countPendingApprovals: pendingQueues,
  countOpenSupportRequests: openSupportQueues,
};
const ACTIONS = Object.keys(COUNTED_QUEUES);

const MISCONFIGURED = { status: 500, body: { error: 'Server misconfiguration' } };

/**
 * The sidebar's Approvals badge: how many items wait in each of the Approvals screen's three
 * queues (`countPendingApprovals`). Since AD-12's 2026-10-07 amendment, also the Admin
 * dashboard's open support and dispute requests (`countOpenSupportRequests`). Admin-only,
 * like the queues themselves — the review, flag and support tables are Function-only, so the
 * client has no table IDs to count them with. Each count reads one row at most and takes
 * Appwrite's `total`, never the rows.
 *
 * ClientCtor/AccountCtor/DatabasesCtor are injectable so tests can substitute fakes.
 */
export async function handleApprovalCountsRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  DatabasesCtor = TablesDB,
}) {
  const action = requestedAction(req.bodyRaw);
  const queues = COUNTED_QUEUES[action]();
  const request = await prepareRequest({ req, ClientCtor, AccountCtor, queues, error });
  if (request.errorResponse) {
    return res.json(request.errorResponse.body, request.errorResponse.status);
  }
  const result = await countQueues({ ...request, action, queues, DatabasesCtor, error });
  if (result.status === 200) {
    log(`${action} succeeded (by admin ${request.caller.$id})`);
  }
  return res.json(result.body, result.status);
}

// main.js only routes here for one of ACTIONS, so the body has already parsed once.
function requestedAction(bodyRaw) {
  return JSON.parse(bodyRaw || '{}').action;
}

async function prepareRequest({ req, ClientCtor, AccountCtor, queues, error }) {
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
    return verified;
  }
  const adminClient = buildAdminClient({ req, ClientCtor, endpoint, projectId, queues, error });
  return adminClient.errorResponse ? adminClient : { caller: verified.caller, adminClient };
}

function buildAdminClient({ req, ClientCtor, endpoint, projectId, queues, error }) {
  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey || !areQueueTablesConfigured(queues)) {
    error('count: missing execution API key or database/table IDs.');
    return { errorResponse: MISCONFIGURED };
  }
  return buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);
}

function areQueueTablesConfigured(queues) {
  const tableIds = Object.values(queues).map((queue) => queue.tableId);
  return [process.env.APPWRITE_DATABASE_ID, ...tableIds].every(hasValue);
}

// The same status filters each Approvals tab lists by, so the badge never disagrees with them.
function pendingQueues() {
  return {
    applications: {
      tableId: process.env.APPWRITE_TENANTS_COLLECTION_ID,
      statuses: ['pending'],
    },
    identityReviews: {
      tableId: process.env.APPWRITE_IDENTITY_REVIEWS_COLLECTION_ID,
      statuses: QUEUED_REVIEW_STATUSES,
    },
    duplicateEvents: {
      tableId: process.env.APPWRITE_DUPLICATE_EVENT_FLAGS_COLLECTION_ID,
      statuses: [OPEN_FLAG_STATUS],
    },
  };
}

// Support and dispute requests alike start (and, with no ticket tracking — FR-20, stay) open.
function openSupportQueues() {
  return {
    supportRequests: {
      tableId: process.env.APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID,
      statuses: ['open'],
    },
  };
}

async function countQueues({ DatabasesCtor, adminClient, action, queues, error }) {
  const databases = new DatabasesCtor(adminClient);
  try {
    const counted = Object.entries(queues).map(async ([name, queue]) => [
      name,
      await countQueueRows(databases, queue),
    ]);
    const counts = Object.fromEntries(await Promise.all(counted));
    return { status: 200, body: { success: true, counts } };
  } catch (err) {
    error(`${action}: count failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to count' } };
  }
}

async function countQueueRows(databases, { tableId, statuses }) {
  const { total } = await databases.listRows({
    databaseId: process.env.APPWRITE_DATABASE_ID,
    tableId,
    queries: [Query.equal('status', statuses), Query.limit(1)],
  });
  return total;
}

export { ACTIONS as APPROVAL_COUNT_ACTIONS };
