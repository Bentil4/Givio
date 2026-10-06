import { Client, Account, TablesDB } from 'node-appwrite';
import { PAYLOAD_VALIDATORS } from './tenant-events/event-fields.js';
import { prepareOrganizerRequest } from './tenant-events/organizer-request.js';
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
  const request = await prepareOrganizerRequest({
    req,
    ClientCtor,
    AccountCtor,
    error,
    validators: PAYLOAD_VALIDATORS,
    tableIds: requiredTableIds(),
  });
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

function requiredTableIds() {
  return [
    process.env.APPWRITE_DATABASE_ID,
    process.env.APPWRITE_EVENTS_COLLECTION_ID,
    process.env.APPWRITE_TENANTS_COLLECTION_ID,
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID,
  ];
}

export { ACTIONS as TENANT_EVENT_ACTIONS };
