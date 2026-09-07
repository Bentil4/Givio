import { Client, Account, TablesDB, ID, Permission, Role } from 'node-appwrite';
import { buildClient, verifyCaller, verifyAdminCaller, VALID, invalid, hasValue } from './shared.js';

const ACTIONS = ['recordConflict', 'resolveConflict'];
const RESOLUTIONS = ['keep-local', 'keep-server', 'keep-both'];

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

/** Same shape as donation-recording.js's computeDonationPermissions (AD-2). */
function computeDonationPermissions(assignedUserIds) {
  return [
    Permission.read(Role.label('admin')),
    Permission.update(Role.label('admin')),
    Permission.delete(Role.label('admin')),
    ...assignedUserIds.map((userId) => Permission.read(Role.user(userId))),
  ];
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
async function handleRecordConflict({ TablesDBCtor, adminClient, payload, databaseId, conflictsTableId, error }) {
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
async function handleResolveConflict({
  TablesDBCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  eventsTableId,
  donationsTableId,
  conflictsTableId,
  error,
}) {
  const { conflictId, resolution } = payload;
  const tablesDB = new TablesDBCtor(adminClient);

  let conflict;
  try {
    conflict = await tablesDB.getRow({ databaseId, tableId: conflictsTableId, rowId: conflictId });
  } catch (err) {
    error(`resolveConflict: conflict ${conflictId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Conflict not found' } };
  }

  if (conflict.resolvedAt) {
    return { status: 400, body: { error: 'Conflict already resolved' } };
  }

  const local = JSON.parse(conflict.localVersion);
  const server = JSON.parse(conflict.serverVersion);
  let resultDonation = server;

  if (resolution === 'keep-local') {
    try {
      resultDonation = await tablesDB.updateRow({
        databaseId,
        tableId: donationsTableId,
        rowId: server.id,
        data: { ...local, id: server.id },
      });
    } catch (err) {
      error(`resolveConflict: keep-local updateRow failed: ${err.message}`);
      return { status: 502, body: { error: 'Failed to apply the local version' } };
    }
  } else if (resolution === 'keep-both') {
    let event;
    try {
      event = await tablesDB.getRow({ databaseId, tableId: eventsTableId, rowId: conflict.eventId });
    } catch (err) {
      error(`resolveConflict: event ${conflict.eventId} not found: ${err.message}`);
      return { status: 404, body: { error: 'Event not found' } };
    }

    const newId = ID.unique();
    try {
      resultDonation = await tablesDB.createRow({
        databaseId,
        tableId: donationsTableId,
        rowId: newId,
        data: {
          ...local,
          id: newId,
          receiptNumber: `${local.receiptNumber}-B`,
          syncStatus: 'synced',
        },
        permissions: computeDonationPermissions(event.assignedUserIds ?? []),
      });
    } catch (err) {
      error(`resolveConflict: keep-both createRow failed: ${err.message}`);
      return { status: 502, body: { error: 'Failed to save the second version' } };
    }
  }
  // keep-server: the server row is already correct, nothing to write there.

  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: conflictsTableId,
      rowId: conflictId,
      data: { resolvedAt: new Date().toISOString(), resolution },
    });
  } catch (err) {
    error(`resolveConflict: failed to mark conflict resolved: ${err.message}`);
    return { status: 502, body: { error: 'Failed to mark the conflict resolved' } };
  }

  return {
    status: 200,
    body: { success: true, resolution, donation: resultDonation, serverDonation: server },
  };
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
  const { errorResponse, caller } = await verify({ req, ClientCtor, AccountCtor, endpoint, projectId, error });
  if (errorResponse) {
    return res.json(errorResponse.body, errorResponse.status);
  }

  const validation = validatePayload(action, payload);
  if (!validation.valid) {
    return res.json(validation.body, 400);
  }

  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error('Missing x-appwrite-key — the Function\'s execution API key scopes are likely misconfigured.');
    return res.json({ error: 'Server misconfiguration: missing execution API key' }, 500);
  }

  if (!hasValue(databaseId) || !hasValue(eventsTableId) || !hasValue(donationsTableId) || !hasValue(conflictsTableId)) {
    error(
      'Missing APPWRITE_DATABASE_ID/APPWRITE_EVENTS_COLLECTION_ID/APPWRITE_DONATIONS_COLLECTION_ID/' +
        'APPWRITE_DONATION_CONFLICTS_COLLECTION_ID function variables.',
    );
    return res.json({ error: 'Server misconfiguration: missing database/table ID' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);

  let result;
  switch (action) {
    case 'recordConflict':
      result = await handleRecordConflict({ TablesDBCtor, adminClient, payload, databaseId, conflictsTableId, error });
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
