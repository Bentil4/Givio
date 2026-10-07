import { ID } from 'node-appwrite';
import { resolveEventReadPermissions } from '../tenant-grants.js';
import { authorizeOrganizerEventAccess, resolveOrganizerTenant } from './organizer-scope.js';
import { pickEventDetails, statusTransitionError } from './event-fields.js';
import { writeEventAuditLog } from './event-audit.js';
import { runDuplicateEventCheck } from './duplicate-event-check.js';

/**
 * Creates an Event owned by the caller's own Tenant. tenantId comes from their Membership,
 * resolved now (never from the client, never cached in an outbox), and the row's permissions
 * come from AD-2's one rule (resolveEventReadPermissions) — so the tenant's organizer-tier
 * members can read it from the moment it exists. Story 7.4's duplicate check runs afterwards.
 */
export async function createTenantEvent(context) {
  const scope = await resolveOrganizerTenant(context);
  if (scope.errorResponse) {
    return scope.errorResponse;
  }
  const data = newTenantEventData({ ...context, tenantId: scope.tenantId });
  const created = await insertEventRow({ ...context, data });
  if (created.errorResponse) {
    return created.errorResponse;
  }
  await auditEventChange({ ...context, event: created.row, action: 'create', before: null });
  await runDuplicateEventCheck({ ...context, event: created.row });
  return { status: 200, body: { success: true, event: created.row } };
}

/** Edits an own-tenant Event's details. A closed Event is read-only (Story 2.1's rule). */
export async function updateTenantEvent(context) {
  const access = await authorizeOrganizerEventAccess({
    ...context,
    eventId: context.payload.eventId,
  });
  if (access.errorResponse) {
    return access.errorResponse;
  }
  if (access.event.status === 'closed') {
    return { status: 400, body: { error: 'Cannot edit a closed event' } };
  }
  const changes = pickEventDetails(context.payload);
  return saveEventChange({ ...context, event: access.event, changes });
}

/** Pause/resume/close/reopen an own-tenant Event, under Story 2.2's transition rule. */
export async function setTenantEventStatus(context) {
  const access = await authorizeOrganizerEventAccess({
    ...context,
    eventId: context.payload.eventId,
  });
  if (access.errorResponse) {
    return access.errorResponse;
  }
  const { status } = context.payload;
  const transitionError = statusTransitionError(access.event.status, status);
  if (transitionError) {
    return { status: 400, body: { error: transitionError } };
  }
  return saveEventChange({ ...context, event: access.event, changes: { status } });
}

function newTenantEventData({ payload, caller, tenantId }) {
  const now = new Date().toISOString();
  const id = ID.unique();
  return {
    id,
    ...pickEventDetails(payload),
    type: payload.type,
    status: 'active',
    tenantId,
    assignedUserIds: [],
    createdBy: caller.$id,
    nextReceiptSeq: 0,
    createdAt: now,
    updatedAt: now,
  };
}

async function insertEventRow({ DatabasesCtor, adminClient, data, error }) {
  let permissions;
  try {
    permissions = await resolveEventReadPermissions({ DatabasesCtor, adminClient, event: data });
  } catch (err) {
    error(
      `createTenantEvent: resolving permissions for tenant ${data.tenantId} failed: ${err.message}`,
    );
    return failure('Failed to create the event');
  }
  try {
    const row = await new DatabasesCtor(adminClient).createRow({
      ...eventsTable(),
      rowId: data.id,
      data,
      permissions,
    });
    return { row };
  } catch (err) {
    error(`createTenantEvent: createRow failed: ${err.message}`);
    return failure('Failed to create the event');
  }
}

async function saveEventChange(context) {
  const { DatabasesCtor, adminClient, event, changes, error } = context;
  // Captured before the write: the row object may be the one the write updates.
  const before = pickKeys(event, Object.keys(changes));
  let row;
  try {
    row = await new DatabasesCtor(adminClient).updateRow({
      ...eventsTable(),
      rowId: event.$id,
      data: { ...changes, updatedAt: new Date().toISOString() },
    });
  } catch (err) {
    error(`tenant event ${event.$id}: updateRow failed: ${err.message}`);
    return failure('Failed to save the event').errorResponse;
  }
  await auditEventChange({ ...context, event: { ...event, ...changes }, action: 'edit', before });
  return { status: 200, body: { success: true, event: row } };
}

/** `before` null logs the whole new Event (a create); otherwise only the changed fields. */
async function auditEventChange({
  DatabasesCtor,
  adminClient,
  caller,
  event,
  action,
  before,
  error,
}) {
  const changed = before === null ? event : pickKeys(event, Object.keys(before));
  await writeEventAuditLog({
    DatabasesCtor,
    adminClient,
    entry: {
      eventId: event.$id,
      action,
      performedBy: caller.$id,
      previousValues: before,
      newValues: { ...changed, tenantId: event.tenantId },
    },
    error,
  });
}

function pickKeys(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key] ?? null]));
}

function eventsTable() {
  return {
    databaseId: process.env.APPWRITE_DATABASE_ID,
    tableId: process.env.APPWRITE_EVENTS_COLLECTION_ID,
  };
}

function failure(message) {
  return { errorResponse: { status: 502, body: { error: message } } };
}
