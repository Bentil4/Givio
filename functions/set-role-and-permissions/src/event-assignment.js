import { Client, Account, Users, TablesDB, Permission, Role } from 'node-appwrite';
import { buildClient, verifyAdminCaller, VALID, invalid, hasValue } from './shared.js';

const ACTIONS = ['assignOperators'];

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length > 0);
}

const PAYLOAD_VALIDATORS = {
  assignOperators: ({ eventId, assignedUserIds }) => {
    if (!hasValue(eventId)) {
      return invalid('Request must include eventId');
    }
    if (!isStringArray(assignedUserIds)) {
      return invalid('Request must include assignedUserIds as an array of user IDs (may be empty)');
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
 * Confirms every ID in assignedUserIds is a real account with the operator role — a
 * non-existent or non-operator ID here would otherwise be written straight into
 * Event.assignedUserIds (and granted document permissions) on the strength of nothing but
 * client input. Runs one users.get() per ID; assignment lists are small (a handful of
 * operators per event), so this isn't worth batching.
 */
async function rejectNonOperatorIds({ UsersCtor, adminClient, assignedUserIds, error }) {
  const users = new UsersCtor(adminClient);

  for (const userId of assignedUserIds) {
    let account;
    try {
      account = await users.get({ userId });
    } catch (err) {
      error(`assignOperators: users.get(${userId}) failed: ${err.message}`);
      return invalid(`User ${userId} does not exist`);
    }
    if (!(account.labels ?? []).includes('operator')) {
      return invalid(`User ${userId} is not an Operator`);
    }
  }

  return VALID;
}

/**
 * Recomputes an Event document's Appwrite permissions from its assignedUserIds (AD-2): Admin
 * keeps full CRUD via the Label; each assigned Operator gets read-only document access (the
 * app's own UI is the only place event fields are edited, and only by an Admin — Story 2.1/
 * 2.2). Donation-row permissions aren't touched here — Story 3.1 sets those directly at
 * creation from the assignedUserIds already known at that moment, the same way EventDataService
 * sets an Event's own permissions at create time. Known gap: if assignedUserIds ever changes
 * *after* donations already exist for that event, this Function does not retroactively rewrite
 * their permissions — a re-assigned/unassigned Operator's access to already-existing Donations
 * won't reflect the change until this Function is extended to do that bulk rewrite too.
 */
function computeEventPermissions(assignedUserIds) {
  return [
    Permission.read(Role.label('admin')),
    Permission.update(Role.label('admin')),
    Permission.delete(Role.label('admin')),
    ...assignedUserIds.map((userId) => Permission.read(Role.user(userId))),
  ];
}

async function handleAssignOperators({ DatabasesCtor, adminClient, payload, databaseId, eventsCollectionId, error }) {
  const { eventId, assignedUserIds } = payload;
  const databases = new DatabasesCtor(adminClient);

  try {
    await databases.getRow({ databaseId, tableId: eventsCollectionId, rowId: eventId });
  } catch (err) {
    error(`assignOperators: event ${eventId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Event not found' } };
  }

  try {
    await databases.updateRow({
      databaseId,
      tableId: eventsCollectionId,
      rowId: eventId,
      data: { assignedUserIds },
      permissions: computeEventPermissions(assignedUserIds),
    });
  } catch (err) {
    error(`assignOperators: updateRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to save operator assignment' } };
  }

  return { status: 200, body: { success: true, eventId, assignedUserIds } };
}

/**
 * Extends the same trusted Function (AD-9) to also be the sole writer of
 * Event.assignedUserIds and the Appwrite document permissions derived from it (AD-2,
 * Story 2.3) — Databases document permissions can only be set with a server API key, never
 * from the client SDK, which is why this can't just be an EventDataService.updateEvent()
 * call.
 *
 * ClientCtor/AccountCtor/UsersCtor/DatabasesCtor are injectable so tests can substitute
 * fakes without module-mocking node-appwrite.
 */
export async function handleEventAssignmentRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  UsersCtor = Users,
  DatabasesCtor = TablesDB,
}) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  // Custom function variables (Appwrite Console → Functions → this function → Settings →
  // Variables) — not auto-injected like the two above. Never committed: see this repo's
  // src/environments/environment.ts for the equivalent client-side IDs and why they're
  // gitignored instead.
  const databaseId = process.env.APPWRITE_DATABASE_ID;
  const eventsCollectionId = process.env.APPWRITE_EVENTS_COLLECTION_ID;

  const { errorResponse, caller } = await verifyAdminCaller({
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

  let body;
  try {
    body = JSON.parse(req.bodyRaw || '{}');
  } catch {
    return res.json({ error: 'Invalid JSON body' }, 400);
  }

  const { action, ...payload } = body ?? {};

  const validation = validatePayload(action, payload);
  if (!validation.valid) {
    return res.json(validation.body, 400);
  }

  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error('Missing x-appwrite-key — the Function\'s execution API key scopes are likely misconfigured.');
    return res.json({ error: 'Server misconfiguration: missing execution API key' }, 500);
  }

  if (!hasValue(databaseId) || !hasValue(eventsCollectionId)) {
    error('Missing APPWRITE_DATABASE_ID/APPWRITE_EVENTS_COLLECTION_ID function variables.');
    return res.json({ error: 'Server misconfiguration: missing database/collection ID' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);

  const operatorCheck = await rejectNonOperatorIds({
    UsersCtor,
    adminClient,
    assignedUserIds: payload.assignedUserIds,
    error,
  });
  if (!operatorCheck.valid) {
    return res.json(operatorCheck.body, 400);
  }

  let result;
  switch (action) {
    case 'assignOperators':
      result = await handleAssignOperators({
        DatabasesCtor,
        adminClient,
        payload,
        databaseId,
        eventsCollectionId,
        error,
      });
      break;
  }

  if (result.status === 200) {
    log(`${action} succeeded (by admin ${caller.$id}): ${JSON.stringify(result.body)}`);
  }
  return res.json(result.body, result.status);
}

export { ACTIONS as EVENT_ASSIGNMENT_ACTIONS };
