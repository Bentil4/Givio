import { Query } from 'node-appwrite';
import { listAllRows } from '../shared.js';
import { applyConflictResolution } from '../conflict-resolution.js';
import { writeTenantAuditLog } from '../tenant-events/event-audit.js';
import {
  authorizeTenantConflictAccess,
  conflictsTableId,
  donationsTableId,
  resolveSuperOrganizerTenant,
} from './donation-scope.js';
import { donationSnapshot } from './donation-writes.js';

/** Appwrite caps the values a single Query.equal may carry at 100. */
const EVENT_IDS_PER_QUERY = 100;

/**
 * The open sync conflicts on the caller's own Events. donation_conflicts rows stay Admin-read
 * only, so a Super Organizer reads them here, filtered by their Tenant's Event ids (FR-2).
 */
export async function listTenantConflicts(context) {
  const scope = await resolveSuperOrganizerTenant(context);
  if (scope.errorResponse) {
    return scope.errorResponse;
  }
  try {
    const eventIds = await tenantEventIds({ ...context, tenantId: scope.tenantId });
    const rows = await openConflictsFor({ ...context, eventIds });
    return { status: 200, body: { success: true, conflicts: rows.map(toConflictView) } };
  } catch (err) {
    context.error(`listTenantConflicts: lookup failed for ${scope.tenantId}: ${err.message}`);
    return { status: 502, body: { error: 'Failed to load sync conflicts' } };
  }
}

/** Admin's resolution (conflict-resolution.js), on a conflict from the caller's own Event. */
export async function resolveTenantConflict(context) {
  const access = await authorizeTenantConflictAccess(context);
  if (access.errorResponse) {
    return access.errorResponse;
  }
  const result = await applyConflictResolution({
    ...context,
    ...resolutionTables(),
    TablesDBCtor: context.DatabasesCtor,
    conflict: access.conflict,
    resolution: context.payload.resolution,
  });
  if (result.status === 200) {
    await auditResolution({ ...context, tenantId: access.tenantId, result: result.body });
  }
  return result;
}

async function tenantEventIds({ DatabasesCtor, adminClient, tenantId }) {
  const events = await listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId: process.env.APPWRITE_DATABASE_ID,
    tableId: process.env.APPWRITE_EVENTS_COLLECTION_ID,
    queries: [Query.equal('tenantId', [tenantId]), Query.select(['$id'])],
  });
  return events.map((event) => event.$id);
}

async function openConflictsFor({ DatabasesCtor, adminClient, eventIds }) {
  const batches = chunk(eventIds, EVENT_IDS_PER_QUERY);
  const pages = await Promise.all(
    batches.map((ids) =>
      listAllRows({
        DatabasesCtor,
        adminClient,
        databaseId: process.env.APPWRITE_DATABASE_ID,
        tableId: conflictsTableId(),
        queries: [Query.equal('eventId', ids), Query.isNull('resolvedAt')],
      }),
    ),
  );
  return pages.flat();
}

function toConflictView(row) {
  return {
    conflictId: row.$id,
    eventId: row.eventId,
    receiptNumber: row.receiptNumber,
    local: JSON.parse(row.localVersion),
    server: JSON.parse(row.serverVersion),
    detectedAt: row.detectedAt,
  };
}

/** Logged as an edit of the donation, so the company's audit trail shows who chose what. */
async function auditResolution({ DatabasesCtor, adminClient, caller, tenantId, result, error }) {
  const { resolution, donation, serverDonation } = result;
  await writeTenantAuditLog({
    DatabasesCtor,
    adminClient,
    entry: {
      entityType: 'donation',
      entityId: serverDonation.id,
      action: 'edit',
      performedBy: caller.$id,
      previousValues: serverDonation,
      newValues: { ...donationSnapshot(donation), resolution, tenantId },
    },
    error,
  });
}

function resolutionTables() {
  return {
    databaseId: process.env.APPWRITE_DATABASE_ID,
    eventsTableId: process.env.APPWRITE_EVENTS_COLLECTION_ID,
    donationsTableId: donationsTableId(),
    conflictsTableId: conflictsTableId(),
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}
