import { Client, Account, TablesDB, ID, Permission, Role } from 'node-appwrite';
import {
  buildClient,
  verifyCaller,
  verifyAdminCaller,
  VALID,
  invalid,
  hasValue,
  rejectUnapprovedTenantMember,
} from './shared.js';
import { resolveEventReadPermissions } from './tenant-grants.js';

const ACTIONS = ['recordConflict', 'resolveConflict'];
export const RESOLUTIONS = ['keep-local', 'keep-server', 'keep-both'];

const PAYLOAD_VALIDATORS = {
  recordConflict: ({ receiptNumber, eventId, localVersion, serverVersion }) => {
    if (!hasValue(receiptNumber)) return invalid('Request must include receiptNumber');
    if (!hasValue(eventId)) return invalid('Request must include eventId');
    if (typeof localVersion !== 'object' || localVersion === null) {
      return invalid('Request must include localVersion as an object');
    }
    if (typeof serverVersion !== 'object' || serverVersion === null) {
      return invalid('Request must include serverVersion as an object');
    }
    return VALID;
  },
  resolveConflict: ({ conflictId, resolution }) => {
    if (!hasValue(conflictId)) return invalid('Request must include conflictId');
    if (!RESOLUTIONS.includes(resolution)) {
      return invalid(`Request must include resolution as one of: ${RESOLUTIONS.join(', ')}`);
    }
    return VALID;
  },
};

function validatePayload(action, payload) {
  const validator = PAYLOAD_VALIDATORS[action];
  if (!validator) {
    return invalid(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  return validator(payload ?? {});
}

/**
 * Files a conflict record (Story 3.5, FR-OFF-005): whichever device (usually an Operator's,
 * mid-sync) detects that its `baseUpdatedAt` no longer matches the server row's current
 * `$updatedAt` calls this instead of applying its own update blindly. Needs the same elevated
 * trust as recordDonation (AD-9): the caller's own session can't grant
 * `Role.label('admin')`-only read/update permissions on a row it creates, only a role it
 * already holds itself — and an Operator holds neither `admin` nor a specific stake in who
 * else can read this conflict.
 */
async function handleRecordConflict({
  TablesDBCtor,
  adminClient,
  payload,
  databaseId,
  conflictsTableId,
  error,
}) {
  const { receiptNumber, eventId, localVersion, serverVersion } = payload;
  const tablesDB = new TablesDBCtor(adminClient);

  try {
    const row = await tablesDB.createRow({
      databaseId,
      tableId: conflictsTableId,
      rowId: ID.unique(),
      data: {
        receiptNumber,
        eventId,
        localVersion: JSON.stringify(localVersion),
        serverVersion: JSON.stringify(serverVersion),
        detectedAt: new Date().toISOString(),
      },
      permissions: [Permission.read(Role.label('admin')), Permission.update(Role.label('admin'))],
    });
    return { status: 200, body: { success: true, conflictId: row.$id } };
  } catch (err) {
    error(`recordConflict: createRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to record conflict' } };
  }
}

/**
 * Admin-only (verifyAdminCaller, unlike recordConflict): applies the chosen resolution and
 * marks the conflict row resolved. `keep-both` needs the same elevated permission-granting as
 * recordDonation to correctly re-derive the new row's operator read access from the event's
 * assignedUserIds — an Admin's own session could only ever grant its own label, not an
 * arbitrary operator's Role.user(uid).
 */
async function handleResolveConflict(context) {
  const loaded = await loadConflict({ ...context, conflictId: context.payload.conflictId });
  if (loaded.errorResponse) {
    return loaded.errorResponse;
  }
  return applyConflictResolution({
    ...context,
    conflict: loaded.conflict,
    resolution: context.payload.resolution,
  });
}

/** `{ conflict }` or `{ errorResponse }` (404). Shared with a Super Organizer's resolution. */
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
 * The resolution itself, whoever is allowed to choose it (Admin here, a Super Organizer in
 * tenant-donations): keep-server writes nothing to the donation, keep-local overwrites it with
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

export async function handleConflictResolutionRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  TablesDBCtor = TablesDB,
}) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const databaseId = process.env.APPWRITE_DATABASE_ID;
  const eventsTableId = process.env.APPWRITE_EVENTS_COLLECTION_ID;
  const donationsTableId = process.env.APPWRITE_DONATIONS_COLLECTION_ID;
  const conflictsTableId = process.env.APPWRITE_DONATION_CONFLICTS_COLLECTION_ID;

  let body;
  try {
    body = JSON.parse(req.bodyRaw || '{}');
  } catch {
    return res.json({ error: 'Invalid JSON body' }, 400);
  }
  const { action, ...payload } = body ?? {};

  // recordConflict is callable by any authenticated caller (usually an Operator mid-sync);
  // resolveConflict is Admin-only, same asymmetry as donation-recording.js/event-assignment.js.
  const verify = action === 'resolveConflict' ? verifyAdminCaller : verifyCaller;
  const { errorResponse, caller } = await verify({
    req,
    ClientCtor,
    AccountCtor,
    endpoint,
    projectId,
    error,
  });
  if (errorResponse) {
    return res.json(errorResponse.body, errorResponse.status);
  }

  const validation = validatePayload(action, payload);
  if (!validation.valid) {
    return res.json(validation.body, 400);
  }

  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error(
      "Missing x-appwrite-key — the Function's execution API key scopes are likely misconfigured.",
    );
    return res.json({ error: 'Server misconfiguration: missing execution API key' }, 500);
  }

  if (
    !hasValue(databaseId) ||
    !hasValue(eventsTableId) ||
    !hasValue(donationsTableId) ||
    !hasValue(conflictsTableId)
  ) {
    error(
      'Missing APPWRITE_DATABASE_ID/APPWRITE_EVENTS_COLLECTION_ID/APPWRITE_DONATIONS_COLLECTION_ID/' +
        'APPWRITE_DONATION_CONFLICTS_COLLECTION_ID function variables.',
    );
    return res.json({ error: 'Server misconfiguration: missing database/table ID' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);

  const tenantRejection = await rejectUnapprovedTenantMember({
    DatabasesCtor: TablesDBCtor,
    adminClient,
    databaseId,
    caller,
    error,
  });
  if (tenantRejection) {
    return res.json(tenantRejection.body, tenantRejection.status);
  }

  let result;
  switch (action) {
    case 'recordConflict':
      result = await handleRecordConflict({
        TablesDBCtor,
        adminClient,
        payload,
        databaseId,
        conflictsTableId,
        error,
      });
      break;
    case 'resolveConflict':
      result = await handleResolveConflict({
        TablesDBCtor,
        adminClient,
        payload,
        caller,
        databaseId,
        eventsTableId,
        donationsTableId,
        conflictsTableId,
        error,
      });
      break;
  }

  if (result.status === 200) {
    log(`${action} succeeded (by ${caller.$id}): ${JSON.stringify(result.body)}`);
  }
  return res.json(result.body, result.status);
}

export { ACTIONS as CONFLICT_RESOLUTION_ACTIONS };
