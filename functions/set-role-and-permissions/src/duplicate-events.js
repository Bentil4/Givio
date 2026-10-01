import { Client, Account, TablesDB } from 'node-appwrite';
import { buildClient, verifyAdminCaller, hasValue, invalid, VALID } from './shared.js';
import { isDuplicateFlagTableConfigured } from './duplicate-events/flag-store.js';
import {
  DUPLICATE_FLAG_DECISIONS,
  listOpenDuplicateFlags,
  resolveDuplicateFlag,
} from './duplicate-events/flag-queue.js';

const ACTION_HANDLERS = {
  listDuplicateEventFlags: listOpenDuplicateFlags,
  resolveDuplicateEventFlag: resolveDuplicateFlag,
};

const ACTIONS = Object.keys(ACTION_HANDLERS);

const PAYLOAD_VALIDATORS = {
  listDuplicateEventFlags: () => VALID,
  resolveDuplicateEventFlag: validateDecision,
};

/**
 * Story 7.4 (FR-14, AD-13): Admin's review of the duplicate-event flags that
 * tenant-events/duplicate-event-check.js raises when an Event is created. Both actions are
 * Admin-only — the flags table is Function-written and names Events across tenants.
 *
 * ClientCtor/AccountCtor/DatabasesCtor are injectable so tests can substitute fakes.
 */
export async function handleDuplicateEventsRequest({
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
  const result = await ACTION_HANDLERS[request.action]({
    DatabasesCtor,
    adminClient: request.adminClient,
    payload: request.payload,
    caller: request.caller,
    error,
  });
  if (result.status === 200) {
    log(`${request.action} succeeded (by admin ${request.caller.$id})`);
  }
  return res.json(result.body, result.status);
}

async function prepareRequest({ req, ClientCtor, AccountCtor, error }) {
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
  const parsed = parseAndValidate(req.bodyRaw);
  if (parsed.errorResponse) {
    return parsed;
  }
  const keyCheck = requireServerConfig(req, error);
  if (keyCheck.errorResponse) {
    return keyCheck;
  }
  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(keyCheck.dynamicKey);
  return { ...parsed, caller: verified.caller, adminClient };
}

function parseAndValidate(bodyRaw) {
  let body;
  try {
    body = JSON.parse(bodyRaw || '{}');
  } catch {
    return badRequest({ error: 'Invalid JSON body' });
  }
  const { action, ...payload } = body ?? {};
  const validator = PAYLOAD_VALIDATORS[action];
  const validation = validator
    ? validator(payload)
    : invalid(`action must be one of: ${ACTIONS.join(', ')}`);
  return validation.valid ? { action, payload } : badRequest(validation.body);
}

function validateDecision({ flagId, decision }) {
  if (!hasValue(flagId)) {
    return invalid('Request must include flagId');
  }
  const decisions = Object.keys(DUPLICATE_FLAG_DECISIONS);
  return decisions.includes(decision)
    ? VALID
    : invalid(`decision must be one of: ${decisions.join(', ')}`);
}

function badRequest(body) {
  return { errorResponse: { status: 400, body } };
}

function requireServerConfig(req, error) {
  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error("Missing x-appwrite-key — the Function's execution API key scopes are misconfigured.");
    return serverMisconfigured('missing execution API key');
  }
  if (!isDuplicateFlagTableConfigured()) {
    error('Missing database/events/duplicate-event-flags function variables.');
    return serverMisconfigured('missing database/table ID');
  }
  return { dynamicKey };
}

function serverMisconfigured(reason) {
  return { errorResponse: { status: 500, body: { error: `Server misconfiguration: ${reason}` } } };
}

export { ACTIONS as DUPLICATE_EVENT_ACTIONS };
