import { ID, Permission, Role } from 'node-appwrite';
import { hasValue, isConflictError } from '../shared.js';

export const OPEN_FLAG_STATUS = 'open';

// Row-level read for Admin alone, matching the table's own permissions: a flag names two
// tenants' Events side by side, which no tenant-scoped role may see (AD-13).
const ADMIN_ONLY_READ = [Permission.read(Role.label('admin'))];

export function duplicateFlagTables() {
  return {
    databaseId: process.env.APPWRITE_DATABASE_ID,
    eventsTableId: process.env.APPWRITE_EVENTS_COLLECTION_ID,
    flagsTableId: process.env.APPWRITE_DUPLICATE_EVENT_FLAGS_COLLECTION_ID,
    tenantsTableId: process.env.APPWRITE_TENANTS_COLLECTION_ID,
  };
}

export function isDuplicateFlagTableConfigured() {
  const { databaseId, eventsTableId, flagsTableId } = duplicateFlagTables();
  return [databaseId, eventsTableId, flagsTableId].every(hasValue);
}

/**
 * The same for (A, B) and (B, A), and unique in the flags table — so a pair is flagged at most
 * once ever, and a flag Admin cleared can never come back for those two Events.
 */
export function duplicatePairKey(firstEventId, secondEventId) {
  return [firstEventId, secondEventId].sort().join(':');
}

/** Writes one open flag; an existing flag for the same pair (any status) is left as it is. */
export async function writeDuplicateFlag({ DatabasesCtor, adminClient, event, match, error }) {
  const { databaseId, flagsTableId } = duplicateFlagTables();
  try {
    await new DatabasesCtor(adminClient).createRow({
      databaseId,
      tableId: flagsTableId,
      rowId: ID.unique(),
      data: newFlagData(event, match),
      permissions: ADMIN_ONLY_READ,
    });
  } catch (err) {
    if (!isConflictError(err)) {
      error(`duplicate-event flag for ${event.$id} failed: ${err.message}`);
    }
  }
}

function newFlagData(event, { candidate, matchedOn }) {
  return {
    pairKey: duplicatePairKey(event.$id, candidate.$id),
    eventId: event.$id,
    matchedEventId: candidate.$id,
    tenantId: event.tenantId ?? null,
    matchedTenantId: candidate.tenantId ?? null,
    matchedOn,
    status: OPEN_FLAG_STATUS,
    flaggedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
  };
}
