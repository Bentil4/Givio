import { Client, Account, TablesDB, Permission, Role } from 'node-appwrite';
import { buildClient, verifyCaller, VALID, invalid, hasValue } from './shared.js';

const ACTIONS = ['recordDonation'];
const DONATION_TYPES = ['cash', 'mobile_money', 'in_kind'];

const PAYLOAD_VALIDATORS = {
  recordDonation: ({ donationId, eventId, receiptNumber, donorName, donationType }) => {
    if (!hasValue(donationId)) return invalid('Request must include donationId');
    if (!hasValue(eventId)) return invalid('Request must include eventId');
    if (!hasValue(receiptNumber)) return invalid('Request must include receiptNumber');
    if (!hasValue(donorName)) return invalid('Request must include donorName');
    if (!DONATION_TYPES.includes(donationType)) {
      return invalid(`Request must include donationType as one of: ${DONATION_TYPES.join(', ')}`);
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
 * Same permission shape as event-assignment.js's computeEventPermissions (AD-2): Admin full
 * CRUD via the Label, each of the event's assigned Operators gets read-only access to the
 * Donation.
 */
function computeDonationPermissions(assignedUserIds) {
  return [
    Permission.read(Role.label('admin')),
    Permission.update(Role.label('admin')),
    Permission.delete(Role.label('admin')),
    ...assignedUserIds.map((userId) => Permission.read(Role.user(userId))),
  ];
}

/**
 * Records a Donation with server-derived permissions (AD-2, AD-9): a regular Operator session
 * cannot itself grant `Role.label('admin')` or `Role.user(otherOperatorId)` permissions on a
 * document it creates — only a role it already holds — so unlike EventDataService.createEvent
 * (which only ever grants `Role.label('admin')`, a role the creating Admin already has), this
 * write must go through the Function the same way Story 2.3's assignOperators does. The
 * `receiptNumber` is generated client-side (AD-4/AD-8: the offline write already has one before
 * this call ever happens) and used verbatim here, never regenerated, so the local Dexie copy
 * and the synced Appwrite row never disagree on it.
 */
async function handleRecordDonation({
  TablesDBCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  eventsTableId,
  donationsTableId,
  error,
}) {
  const {
    donationId,
    eventId,
    receiptNumber,
    donorName,
    amountMinor,
    donationType,
    onBehalfOf,
    donorPhone,
    notes,
    recordedAt,
  } = payload;
  const tablesDB = new TablesDBCtor(adminClient);

  let event;
  try {
    event = await tablesDB.getRow({ databaseId, tableId: eventsTableId, rowId: eventId });
  } catch (err) {
    error(`recordDonation: event ${eventId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Event not found' } };
  }

  const isAdmin = (caller.labels ?? []).includes('admin');
  const assignedUserIds = event.assignedUserIds ?? [];
  if (!isAdmin && !assignedUserIds.includes(caller.$id)) {
    return { status: 403, body: { error: 'You are not assigned to this event' } };
  }
  if (event.status !== 'active') {
    return { status: 400, body: { error: 'Cannot record a donation against a paused or closed event' } };
  }

  try {
    const row = await tablesDB.createRow({
      databaseId,
      tableId: donationsTableId,
      rowId: donationId,
      data: {
        id: donationId,
        eventId,
        receiptNumber,
        donorName,
        amountMinor: amountMinor ?? null,
        donationType,
        onBehalfOf,
        donorPhone,
        notes,
        recordedBy: caller.$id,
        recordedAt,
        syncStatus: 'synced',
      },
      permissions: computeDonationPermissions(assignedUserIds),
    });
    return { status: 200, body: { success: true, donation: row } };
  } catch (err) {
    error(`recordDonation: createRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to save donation' } };
  }
}

export async function handleDonationRecordingRequest({
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

  const { errorResponse, caller } = await verifyCaller({
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

  if (!hasValue(databaseId) || !hasValue(eventsTableId) || !hasValue(donationsTableId)) {
    error('Missing APPWRITE_DATABASE_ID/APPWRITE_EVENTS_COLLECTION_ID/APPWRITE_DONATIONS_COLLECTION_ID function variables.');
    return res.json({ error: 'Server misconfiguration: missing database/table ID' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);

  let result;
  switch (action) {
    case 'recordDonation':
      result = await handleRecordDonation({
        TablesDBCtor,
        adminClient,
        payload,
        caller,
        databaseId,
        eventsTableId,
        donationsTableId,
        error,
      });
      break;
  }

  if (result.status === 200) {
    log(`${action} succeeded (by ${caller.$id}): donation ${payload.donationId}`);
  }
  return res.json(result.body, result.status);
}

export { ACTIONS as DONATION_RECORDING_ACTIONS };
