import { hasValue } from '../shared.js';
import { resolveTeamScope } from '../tenant-membership/team-access.js';

const FORBIDDEN = { errorResponse: { status: 403, body: { error: 'Forbidden' } } };

// One body for "no such Event", "another tenant's Event" and "an Admin-created Event with no
// tenantId" (FR-2): an Organizer must not be able to probe which Event ids exist.
const EVENT_NOT_FOUND = { errorResponse: { status: 404, body: { error: 'Event not found' } } };

/**
 * Story 6.7: the Tenant an Organizer-tier caller acts on, resolved at write time from their own
 * active Membership (never the client) by Story 7.1's resolveTeamScope — refused unless that
 * Membership is active, organizer-tier and its Tenant approved (FR-9), and refused when the
 * payload names a different tenantId. Organizer-tier Accounts carry no Label, so any labelled
 * Account (Admin included — it keeps its own paths) is refused before any lookup.
 */
export async function resolveOrganizerTenant({
  DatabasesCtor,
  adminClient,
  payload,
  caller,
  error,
}) {
  if ((caller.labels ?? []).length > 0 || !tenantTablesConfigured()) {
    return FORBIDDEN;
  }
  return resolveTeamScope({
    DatabasesCtor,
    adminClient,
    payload: payload ?? {},
    caller,
    databaseId: process.env.APPWRITE_DATABASE_ID,
    tenantsCollectionId: process.env.APPWRITE_TENANTS_COLLECTION_ID,
    membershipsCollectionId: process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID,
    error,
  });
}

/**
 * The caller's Tenant plus one Event it owns — `{ tenantId, event }` or `{ errorResponse }`.
 * The shared gate for every Organizer action on an existing Event.
 */
export async function authorizeOrganizerEventAccess(context) {
  const scope = await resolveOrganizerTenant(context);
  if (scope.errorResponse) {
    return scope;
  }
  const event = await loadOwnTenantEvent({ ...context, tenantId: scope.tenantId });
  return event ? { tenantId: scope.tenantId, event } : EVENT_NOT_FOUND;
}

async function loadOwnTenantEvent({ DatabasesCtor, adminClient, eventId, tenantId, error }) {
  try {
    const event = await new DatabasesCtor(adminClient).getRow({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId: process.env.APPWRITE_EVENTS_COLLECTION_ID,
      rowId: eventId,
    });
    return event.tenantId === tenantId ? event : null;
  } catch (err) {
    error(`loadOwnTenantEvent: event ${eventId} not readable: ${err.message}`);
    return null;
  }
}

function tenantTablesConfigured() {
  return (
    hasValue(process.env.APPWRITE_TENANTS_COLLECTION_ID) &&
    hasValue(process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID)
  );
}
