import { Client, Account, TablesDB } from 'node-appwrite';
import { buildClient, verifyCaller, VALID, invalid, hasValue } from './shared.js';
import { assignOperatorsAsOrganizer } from './tenant-events/organizer-assignment.js';

const ACTIONS = ['assignOperators'];

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length > 0);
}

function validatePayload(action, payload) {
  if (!ACTIONS.includes(action)) {
    return invalid(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  const { eventId, assignedUserIds } = payload ?? {};
  if (!hasValue(eventId)) {
    return invalid('Request must include eventId');
  }
  if (!isStringArray(assignedUserIds)) {
    return invalid('Request must include assignedUserIds as an array of user IDs (may be empty)');
  }
  return VALID;
}

/**
 * The sole writer of Event.assignedUserIds and the Appwrite read permissions derived from it
 * (AD-2, Story 2.3) — row permissions can only be set with a server API key, never from the
 * client SDK. Story 6.7: an Organizer-tier (unlabelled) Account assigns its own Tenant's
 * Operators. AD-12 (amended 2026-10-07): every labelled Account is refused, Admin and
 * Super Admin included — platform Admins have no access to company Events.
 *
 * ClientCtor/AccountCtor/DatabasesCtor are injectable so tests can substitute fakes without
 * module-mocking node-appwrite.
 */
export async function handleEventAssignmentRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  DatabasesCtor = TablesDB,
}) {
  const request = await prepareRequest({ req, ClientCtor, AccountCtor, error });
  if (request.errorResponse) {
    return res.json(request.errorResponse.body, request.errorResponse.status);
  }
  const result = await assignOperatorsAsOrganizer({ ...request, DatabasesCtor, log, error });
  return res.json(result.body, result.status);
}

async function prepareRequest({ req, ClientCtor, AccountCtor, error }) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const verified = await verifyCaller({ req, ClientCtor, AccountCtor, endpoint, projectId, error });
  if (verified.errorResponse) {
    return verified;
  }
  if ((verified.caller.labels ?? []).length > 0) {
    return { errorResponse: { status: 403, body: { error: 'Forbidden' } } };
  }
  const payload = parsePayload(req.bodyRaw);
  if (payload.errorResponse) {
    return payload;
  }
  const adminClient = buildAdminClient({ req, ClientCtor, endpoint, projectId, error });
  if (adminClient.errorResponse) {
    return adminClient;
  }
  return { caller: verified.caller, payload, adminClient };
}

function parsePayload(bodyRaw) {
  let body;
  try {
    body = JSON.parse(bodyRaw || '{}');
  } catch {
    return { errorResponse: { status: 400, body: { error: 'Invalid JSON body' } } };
  }
  const { action, ...payload } = body ?? {};
  const validation = validatePayload(action, payload);
  return validation.valid ? payload : { errorResponse: { status: 400, body: validation.body } };
}

function buildAdminClient({ req, ClientCtor, endpoint, projectId, error }) {
  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error(
      "Missing x-appwrite-key — the Function's execution API key scopes are likely misconfigured.",
    );
    return misconfigured('missing execution API key');
  }
  // Custom function variables, never committed — see src/environments/environment.ts.
  if (
    ![process.env.APPWRITE_DATABASE_ID, process.env.APPWRITE_EVENTS_COLLECTION_ID].every(hasValue)
  ) {
    error('Missing APPWRITE_DATABASE_ID/APPWRITE_EVENTS_COLLECTION_ID function variables.');
    return misconfigured('missing database/collection ID');
  }
  return buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);
}

function misconfigured(reason) {
  return { errorResponse: { status: 500, body: { error: `Server misconfiguration: ${reason}` } } };
}

export { ACTIONS as EVENT_ASSIGNMENT_ACTIONS };
