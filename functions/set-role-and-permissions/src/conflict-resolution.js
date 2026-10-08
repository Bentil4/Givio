import { ID } from 'node-appwrite';
import { resolveEventReadPermissions } from './tenant-grants.js';

// recordConflict was removed 2026-10-08: client-side donation updates were Admin-only, so no
// device files a sync conflict any more. This module now only drains the existing
// DonationConflicts rows, for the Super Organizer (tenant-donations/tenant-conflicts.js).
export const RESOLUTIONS = ['keep-local', 'keep-server', 'keep-both'];

/** `{ conflict }` or `{ errorResponse }` (404), for a Super Organizer's resolution. */
export async function loadConflict({
  TablesDBCtor,
  adminClient,
  databaseId,
  conflictsTableId,
  conflictId,
  error,
}) {
  try {
    const conflict = await new TablesDBCtor(adminClient).getRow({
      databaseId,
      tableId: conflictsTableId,
      rowId: conflictId,
    });
    return { conflict };
  } catch (err) {
    error(`resolveConflict: conflict ${conflictId} not found: ${err.message}`);
    return { errorResponse: { status: 404, body: { error: 'Conflict not found' } } };
  }
}

/**
 * The resolution itself, chosen by the Event's Super Organizer (tenant-donations): keep-server writes nothing to the donation, keep-local overwrites it with
 * the device's version, keep-both saves the device's version as a second `-B` receipt.
 * Expects `{ TablesDBCtor, adminClient, conflict, resolution, databaseId, eventsTableId,
 * donationsTableId, conflictsTableId, error }`.
 */
export async function applyConflictResolution(context) {
  const { conflict, resolution } = context;
  if (conflict.resolvedAt) {
    return { status: 400, body: { error: 'Conflict already resolved' } };
  }
  const local = JSON.parse(conflict.localVersion);
  const server = JSON.parse(conflict.serverVersion);
  const written = await RESOLUTION_WRITERS[resolution]({ ...context, local, server });
  if (written.errorResponse) {
    return written.errorResponse;
  }
  const marked = await markConflictResolved(context);
  if (marked.errorResponse) {
    return marked.errorResponse;
  }
  return {
    status: 200,
    body: { success: true, resolution, donation: written.donation, serverDonation: server },
  };
}

const RESOLUTION_WRITERS = {
  'keep-server': async ({ server }) => ({ donation: server }),
  'keep-local': keepLocalVersion,
  'keep-both': keepBothVersions,
};

async function keepLocalVersion({
  TablesDBCtor,
  adminClient,
  databaseId,
  donationsTableId,
  local,
  server,
  error,
}) {
  try {
    const donation = await new TablesDBCtor(adminClient).updateRow({
      databaseId,
      tableId: donationsTableId,
      rowId: server.id,
      data: { ...local, id: server.id },
    });
    return { donation };
  } catch (err) {
    error(`resolveConflict: keep-local updateRow failed: ${err.message}`);
    return resolutionFailure('Failed to apply the local version');
  }
}

async function keepBothVersions(context) {
  const permissions = await secondVersionPermissions(context);
  if (permissions.errorResponse) {
    return permissions;
  }
  const { TablesDBCtor, adminClient, databaseId, donationsTableId, local, error } = context;
  const newId = ID.unique();
  try {
    const donation = await new TablesDBCtor(adminClient).createRow({
      databaseId,
      tableId: donationsTableId,
      rowId: newId,
      data: {
        ...local,
        id: newId,
        receiptNumber: `${local.receiptNumber}-B`,
        syncStatus: 'synced',
      },
      permissions: permissions.value,
    });
    return { donation };
  } catch (err) {
    error(`resolveConflict: keep-both createRow failed: ${err.message}`);
    return resolutionFailure('Failed to save the second version');
  }
}

/** The second row is readable by exactly who can read its Event (AD-2), like any donation. */
async function secondVersionPermissions({
  TablesDBCtor,
  adminClient,
  databaseId,
  eventsTableId,
  conflict,
  error,
}) {
  let event;
  try {
    event = await new TablesDBCtor(adminClient).getRow({
      databaseId,
      tableId: eventsTableId,
      rowId: conflict.eventId,
    });
  } catch (err) {
    error(`resolveConflict: event ${conflict.eventId} not found: ${err.message}`);
    return { errorResponse: { status: 404, body: { error: 'Event not found' } } };
  }
  try {
    const value = await resolveEventReadPermissions({
      DatabasesCtor: TablesDBCtor,
      adminClient,
      event,
    });
    return { value };
  } catch (err) {
    error(`resolveConflict: resolving read grants for event ${event.$id} failed: ${err.message}`);
    return resolutionFailure('Failed to save the second version');
  }
}

async function markConflictResolved({
  TablesDBCtor,
  adminClient,
  databaseId,
  conflictsTableId,
  conflict,
  resolution,
  error,
}) {
  try {
    await new TablesDBCtor(adminClient).updateRow({
      databaseId,
      tableId: conflictsTableId,
      rowId: conflict.$id,
      data: { resolvedAt: new Date().toISOString(), resolution },
    });
    return {};
  } catch (err) {
    error(`resolveConflict: failed to mark conflict resolved: ${err.message}`);
    return resolutionFailure('Failed to mark the conflict resolved');
  }
}

function resolutionFailure(message) {
  return { errorResponse: { status: 502, body: { error: message } } };
}
