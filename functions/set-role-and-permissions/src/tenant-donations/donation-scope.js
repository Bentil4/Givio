import { resolveOrganizerTenant } from '../tenant-events/organizer-scope.js';

const FORBIDDEN = { errorResponse: { status: 403, body: { error: 'Forbidden' } } };

// One body for "no such row" and "another tenant's row" (FR-2), so ids can't be probed.
const DONATION_NOT_FOUND = {
  errorResponse: { status: 404, body: { error: 'Donation not found' } },
};
const CONFLICT_NOT_FOUND = {
  errorResponse: { status: 404, body: { error: 'Conflict not found' } },
};

/**
 * The caller's Tenant, for a donation correction. Only that Tenant's Super Organizer qualifies:
 * a co-Organizer reads the same donations but may not change them, and a labelled Account
 * (Admin, Operator) is refused by resolveOrganizerTenant before any lookup.
 */
export async function resolveSuperOrganizerTenant(context) {
  const scope = await resolveOrganizerTenant(context);
  if (scope.errorResponse) {
    return scope;
  }
  return scope.callerRole === 'super_organizer' ? scope : FORBIDDEN;
}

/** `{ tenantId, donation }` for a donation on one of the caller's own Events. */
export async function authorizeTenantDonationAccess(context) {
  const scope = await resolveSuperOrganizerTenant(context);
  if (scope.errorResponse) {
    return scope;
  }
  const donation = await readRow(context, donationsTableId(), context.payload.donationId);
  const owned = donation && (await isOwnTenantEvent(context, donation.eventId, scope.tenantId));
  return owned ? { tenantId: scope.tenantId, donation } : DONATION_NOT_FOUND;
}

/** `{ tenantId, conflict }` for a sync conflict on one of the caller's own Events. */
export async function authorizeTenantConflictAccess(context) {
  const scope = await resolveSuperOrganizerTenant(context);
  if (scope.errorResponse) {
    return scope;
  }
  const conflict = await readRow(context, conflictsTableId(), context.payload.conflictId);
  const owned = conflict && (await isOwnTenantEvent(context, conflict.eventId, scope.tenantId));
  return owned ? { tenantId: scope.tenantId, conflict } : CONFLICT_NOT_FOUND;
}

async function isOwnTenantEvent(context, eventId, tenantId) {
  const event = await readRow(context, process.env.APPWRITE_EVENTS_COLLECTION_ID, eventId);
  return event?.tenantId === tenantId;
}

async function readRow({ DatabasesCtor, adminClient, error }, tableId, rowId) {
  try {
    return await new DatabasesCtor(adminClient).getRow({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId,
      rowId,
    });
  } catch (err) {
    error(`tenant donations: row ${rowId} in ${tableId} not readable: ${err.message}`);
    return null;
  }
}

export function donationsTableId() {
  return process.env.APPWRITE_DONATIONS_COLLECTION_ID;
}

export function conflictsTableId() {
  return process.env.APPWRITE_DONATION_CONFLICTS_COLLECTION_ID;
}
