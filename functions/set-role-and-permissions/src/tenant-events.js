import { Client, Account, TablesDB } from 'node-appwrite';
import { buildClient, verifyCaller, hasValue, invalid } from './shared.js';
import { PAYLOAD_VALIDATORS } from './tenant-events/event-fields.js';
import {
  createTenantEvent,
  updateTenantEvent,
  setTenantEventStatus,
} from './tenant-events/event-writes.js';

const ACTION_HANDLERS = {
  createTenantEvent,
  updateTenantEvent,
  setTenantEventStatus,
};

const ACTIONS = Object.keys(ACTION_HANDLERS);

/**
 * Story 6.7: an approved Tenant's Organizer-tier members (Super Organizer and co-Organizer
 * alike) create and manage their own Events. Online-only through this Function, like Admin's
 * setEventStatus — no Dexie outbox, so the Tenant is resolved from the caller's Membership at
 * write time and never cached client-side. Every action is refused unless that Membership is
 * active and its Tenant approved (FR-9), and only ever touches that Tenant's own Events (FR-2).
 * Operator assignment and the family code reuse event-assignment.js / family-access.js.
 *
 * ClientCtor/AccountCtor/DatabasesCtor are injectable so tests can substitute fakes.
 */
export async function handleTenantEventsRequest({
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
    log(`${request.action} succeeded (by organizer ${request.caller.$id})`);
  }
  return res.json(result.body, result.status);
}

async function prepareRequest({ req, ClientCtor, AccountCtor, error }) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const verified = await verifyCaller({ req, ClientCtor, AccountCtor, endpoint, projectId, error });
  if (verified.errorResponse) {
    return verified;
  }
  // Organizer-tier Accounts carry no Label; anyone labelled (Admin keeps its own paths) is
  // refused before the payload is even read, like every other caller gate in this Function.
  if ((verified.caller.labels ?? []).length > 0) {
    return { errorResponse: { status: 403, body: { error: 'Forbidden' } } };
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

function badRequest(body) {
  return { errorResponse: { status: 400, body } };
}

function requireServerConfig(req, error) {
  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error("Missing x-appwrite-key — the Function's execution API key scopes are misconfigured.");
    return serverMisconfigured('missing execution API key');
  }
  const tables = [
    process.env.APPWRITE_DATABASE_ID,
    process.env.APPWRITE_EVENTS_COLLECTION_ID,
    process.env.APPWRITE_TENANTS_COLLECTION_ID,
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID,
  ];
  if (!tables.every(hasValue)) {
    error('Missing database/events/tenants/memberships function variables.');
    return serverMisconfigured('missing database/table ID');
  }
  return { dynamicKey };
}

function serverMisconfigured(reason) {
  return { errorResponse: { status: 500, body: { error: `Server misconfiguration: ${reason}` } } };
}

export { ACTIONS as TENANT_EVENT_ACTIONS };
