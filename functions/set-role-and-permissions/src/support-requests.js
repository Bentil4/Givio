import {
  Client,
  Account,
  Users,
  Messaging,
  TablesDB,
  ID,
  Query,
  Permission,
  Role,
} from 'node-appwrite';
import { notifyAdminsOfDispute } from './dispute-notification.js';
import {
  buildClient,
  verifyCaller,
  VALID,
  invalid,
  hasValue,
  isValidEmail,
  runActionHandler,
} from './shared.js';

const ACTIONS = ['submitSupportRequest', 'submitDispute'];

// submitDispute is the one unauthenticated write path in the whole system: a suspended
// tenant's Organizer can't sign in, so there is no JWT to verify (FR-20).
const PUBLIC_ACTIONS = new Set(['submitDispute']);

const COMPANY_ROLES = ['super_organizer', 'organizer'];

export const SUPPORT_MESSAGE_MAX = 2000;
export const SUPPORT_TENANT_NAME_MAX = 128;
// Rejected before JSON parsing is trusted for anything — a well-formed dispute is well under
// this even at every field's cap.
const MAX_BODY_LENGTH = 8192;

const HOUR_MS = 60 * 60 * 1000;
export const QUESTION_LIMIT_PER_HOUR = 10;
export const DISPUTE_LIMIT_PER_EMAIL_PER_DAY = 3;
export const DISPUTE_LIMIT_GLOBAL_PER_HOUR = 60;

const ADMIN_ONLY_READ = [Permission.read(Role.label('admin'))];

function isBoundedText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

const PAYLOAD_VALIDATORS = {
  submitSupportRequest: ({ message }) => {
    if (!isBoundedText(message, SUPPORT_MESSAGE_MAX)) {
      return invalid(`Enter a message of up to ${SUPPORT_MESSAGE_MAX} characters.`);
    }
    return VALID;
  },
  submitDispute: ({ email, tenantName, message }) => {
    if (typeof email !== 'string' || !isValidEmail(email.trim())) {
      return invalid('Enter a valid email address.');
    }
    if (!isBoundedText(tenantName, SUPPORT_TENANT_NAME_MAX)) {
      return invalid(`Enter your company name (up to ${SUPPORT_TENANT_NAME_MAX} characters).`);
    }
    if (!isBoundedText(message, SUPPORT_MESSAGE_MAX)) {
      return invalid(`Enter a message of up to ${SUPPORT_MESSAGE_MAX} characters.`);
    }
    return VALID;
  },
};

function validatePayload(action, payload) {
  const validator = PAYLOAD_VALIDATORS[action];
  if (!validator) {
    return invalid(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  return validator(payload ?? {});
}

/** Counts at most `cap` rows — enough to answer "is the limit reached" without paging. */
async function countRecent({ tablesDB, databaseId, tableId, filters, since, cap }) {
  const { rows } = await tablesDB.listRows({
    databaseId,
    tableId,
    queries: [
      ...filters,
      Query.greaterThan('createdAt', since.toISOString()),
      Query.select(['$id']),
      Query.limit(cap),
    ],
  });
  return rows.length;
}

async function createSupportRow({ tablesDB, databaseId, tableId, data, error }) {
  try {
    await tablesDB.createRow({
      databaseId,
      tableId,
      rowId: ID.unique(),
      data: { ...data, status: 'open' },
      permissions: ADMIN_ONLY_READ,
    });
  } catch (err) {
    error(`${data.type}: createRow failed: ${err.message}`);
    return { status: 502, body: { error: "Couldn't send your message, try again" } };
  }
  return { status: 200, body: { success: true } };
}

/**
 * tenantId/userId come from the caller's own Membership, never the request body. Any tenant
 * status is allowed — deliberately no rejectUnapprovedTenantMember here: a pending, rejected or
 * suspended tenant's Organizer is exactly who most needs to reach Admin.
 */
async function handleSubmitSupportRequest({
  tablesDB,
  payload,
  caller,
  databaseId,
  supportRequestsTableId,
  membershipsTableId,
  now,
  error,
}) {
  let membership;
  try {
    const { rows } = await tablesDB.listRows({
      databaseId,
      tableId: membershipsTableId,
      queries: [Query.equal('userId', [caller.$id]), Query.limit(1)],
    });
    membership = rows[0];
  } catch (err) {
    error(`submitSupportRequest: membership lookup failed for ${caller.$id}: ${err.message}`);
    return { status: 502, body: { error: "Couldn't send your message, try again" } };
  }
  if (!membership || membership.status !== 'active' || !COMPANY_ROLES.includes(membership.role)) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  const at = now();
  try {
    const recent = await countRecent({
      tablesDB,
      databaseId,
      tableId: supportRequestsTableId,
      filters: [Query.equal('userId', [caller.$id])],
      since: new Date(at.getTime() - HOUR_MS),
      cap: QUESTION_LIMIT_PER_HOUR,
    });
    if (recent >= QUESTION_LIMIT_PER_HOUR) {
      return {
        status: 429,
        body: { error: "You've sent several messages in the last hour. Try again later." },
      };
    }
  } catch (err) {
    error(`submitSupportRequest: rate check failed: ${err.message}`);
    return { status: 502, body: { error: "Couldn't send your message, try again" } };
  }

  return createSupportRow({
    tablesDB,
    databaseId,
    tableId: supportRequestsTableId,
    error,
    data: {
      type: 'question',
      tenantId: membership.tenantId,
      userId: caller.$id,
      contactEmail: caller.email ?? null,
      tenantName: null,
      message: payload.message.trim(),
      createdAt: at.toISOString(),
    },
  });
}

/**
 * Never looks up whether the email or tenant name exists — the response is the same for a real
 * suspended Organizer and a stranger, so this can't be used to enumerate accounts. Admin does
 * the matching when reading the row.
 *
 * Abuse control without extra infrastructure, all from stored rows: a per-email daily cap
 * (answered with the same success body, so it's no oracle and gives a bot nothing to retry),
 * and a global hourly cap on disputes (answered honestly with a 429, so a real person retries
 * later) that bounds how fast random emails can flood the table. No IP is stored: Appwrite's
 * forwarded headers are client-controlled, and it would be personal data kept for no one.
 */
async function handleSubmitDispute({
  tablesDB,
  payload,
  databaseId,
  supportRequestsTableId,
  now,
  error,
  notification,
}) {
  const contactEmail = payload.email.trim().toLowerCase();
  const at = now();

  try {
    const globalRecent = await countRecent({
      tablesDB,
      databaseId,
      tableId: supportRequestsTableId,
      filters: [Query.equal('type', ['dispute'])],
      since: new Date(at.getTime() - HOUR_MS),
      cap: DISPUTE_LIMIT_GLOBAL_PER_HOUR,
    });
    if (globalRecent >= DISPUTE_LIMIT_GLOBAL_PER_HOUR) {
      error('submitDispute: global hourly cap reached');
      return {
        status: 429,
        body: { error: 'We are receiving a lot of requests right now. Try again in an hour.' },
      };
    }

    const emailRecent = await countRecent({
      tablesDB,
      databaseId,
      tableId: supportRequestsTableId,
      filters: [Query.equal('type', ['dispute']), Query.equal('contactEmail', [contactEmail])],
      since: new Date(at.getTime() - 24 * HOUR_MS),
      cap: DISPUTE_LIMIT_PER_EMAIL_PER_DAY,
    });
    if (emailRecent >= DISPUTE_LIMIT_PER_EMAIL_PER_DAY) {
      return { status: 200, body: { success: true } };
    }
  } catch (err) {
    error(`submitDispute: rate check failed: ${err.message}`);
    return { status: 502, body: { error: "Couldn't send your message, try again" } };
  }

  const data = {
    type: 'dispute',
    tenantId: null,
    userId: null,
    contactEmail,
    tenantName: payload.tenantName.trim(),
    message: payload.message.trim(),
    createdAt: at.toISOString(),
  };
  const stored = await createSupportRow({
    tablesDB,
    databaseId,
    tableId: supportRequestsTableId,
    error,
    data,
  });
  if (stored.status === 200) {
    await notifyAdminsOfDispute({ ...notification, dispute: data, error });
  }
  return stored;
}

/**
 * Story 8.3 (FR-20): the sole writer of SupportRequests rows. The table grants no client
 * create permission, and every row is readable by Admin alone — a logged form, not a ticketing
 * system, so nothing here reads rows back to the submitter.
 */
export async function handleSupportRequestsRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  TablesDBCtor = TablesDB,
  UsersCtor = Users,
  MessagingCtor = Messaging,
  now = () => new Date(),
}) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const databaseId = process.env.APPWRITE_DATABASE_ID;
  const supportRequestsTableId = process.env.APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID;
  const membershipsTableId = process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;

  const bodyRaw = req.bodyRaw || '{}';
  if (bodyRaw.length > MAX_BODY_LENGTH) {
    return res.json({ error: 'Request too large' }, 413);
  }
  let body;
  try {
    body = JSON.parse(bodyRaw);
  } catch {
    return res.json({ error: 'Invalid JSON body' }, 400);
  }
  const { action, ...payload } = body ?? {};

  let caller = null;
  if (!PUBLIC_ACTIONS.has(action)) {
    const verified = await verifyCaller({
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
    caller = verified.caller;
  }

  const validation = validatePayload(action, payload);
  if (!validation.valid) {
    return res.json(validation.body, 400);
  }

  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error(
      "Missing x-appwrite-key — the Function's execution API key scopes are likely misconfigured.",
    );
    return res.json({ error: 'Server misconfiguration: missing execution API key' }, 500);
  }

  if (
    !hasValue(databaseId) ||
    !hasValue(supportRequestsTableId) ||
    (action === 'submitSupportRequest' && !hasValue(membershipsTableId))
  ) {
    error(
      'Missing APPWRITE_DATABASE_ID/APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID/APPWRITE_MEMBERSHIPS_COLLECTION_ID function variables.',
    );
    return res.json({ error: 'Server misconfiguration: missing database/table ID' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);
  const actionContext = {
    tablesDB: new TablesDBCtor(adminClient),
    payload,
    caller,
    databaseId,
    supportRequestsTableId,
    membershipsTableId,
    now,
    error,
    notification: { adminClient, UsersCtor, MessagingCtor },
  };

  const result = await runActionHandler({
    handlers: ACTION_HANDLERS,
    action,
    context: actionContext,
    error,
  });

  if (result.status === 200) {
    log(`${action} succeeded${caller ? ` (by ${caller.$id})` : ' (unauthenticated)'}`);
  }
  return res.json(result.body, result.status);
}

export const ACTION_HANDLERS = {
  submitSupportRequest: handleSubmitSupportRequest,
  submitDispute: handleSubmitDispute,
};

export { ACTIONS as SUPPORT_REQUEST_ACTIONS };
