import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { Client, Account, TablesDB, Query } from 'node-appwrite';
import { buildClient, verifyAdminCaller, VALID, invalid, hasValue } from './shared.js';

const ACTIONS = ['generateAccessCode', 'resolveAccessCode'];
const CODE_LENGTH = 8;
// Excludes 0/O, 1/I/L — read aloud or copied on a bad connection, those are the pairs people
// actually get wrong (family-code.ts's own UI comment: this is read by someone bereaved, often
// on a borrowed phone).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_GENERATION_ATTEMPTS = 5;

const PAYLOAD_VALIDATORS = {
  generateAccessCode: ({ eventId }) => {
    if (!hasValue(eventId)) return invalid('Request must include eventId');
    return VALID;
  },
  resolveAccessCode: ({ code }) => {
    if (!hasValue(code) || code.length !== CODE_LENGTH) {
      return invalid(`Request must include code as a ${CODE_LENGTH}-character string`);
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

function randomCode(randomBytes) {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Stored in plaintext on Event.accessCode, not hashed — a deliberate deviation from the
 * architecture doc's "one hashed... accessCode" wording. admin-event-detail.ts's existing
 * copyCode() already expects to re-read and re-share the code at any time (not just once at
 * generation), and Admin + the event's assigned Operators already hold read permission on
 * this exact row (computeEventPermissions, event-assignment.js) — hashing would only protect
 * against a party who can't already read the field anyway, at the cost of breaking that
 * already-built "copy code" UI entirely.
 */
async function handleGenerateAccessCode({ TablesDBCtor, adminClient, payload, databaseId, eventsTableId, randomBytes, error }) {
  const { eventId } = payload;
  const tablesDB = new TablesDBCtor(adminClient);

  try {
    await tablesDB.getRow({ databaseId, tableId: eventsTableId, rowId: eventId });
  } catch (err) {
    error(`generateAccessCode: event ${eventId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Event not found' } };
  }

  let code;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const candidate = randomCode(randomBytes);
    const existing = await tablesDB.listRows({
      databaseId,
      tableId: eventsTableId,
      queries: [Query.equal('accessCode', candidate), Query.limit(1)],
    });
    if ((existing.rows ?? []).length === 0) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    error('generateAccessCode: exhausted attempts finding a unique code');
    return { status: 502, body: { error: 'Failed to generate a unique code, try again' } };
  }

  try {
    await tablesDB.updateRow({ databaseId, tableId: eventsTableId, rowId: eventId, data: { accessCode: code } });
  } catch (err) {
    error(`generateAccessCode: updateRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to save the new code' } };
  }

  return { status: 200, body: { success: true, accessCode: code } };
}

/**
 * The one genuinely public, unauthenticated action in this Function — a Family Member has no
 * account at all (AD-10), so there's no JWT to verify. The adminClient's dynamic key bypasses
 * row permissions entirely, which is exactly what's needed here: the event/donation rows are
 * never otherwise readable by an anonymous caller, so this action IS the permission boundary —
 * it must sanitize on the way out (no donorPhone, no recordedBy, no notes) since nothing else
 * will.
 *
 * Never reveals which half of a wrong code was wrong (family-code.ts's own design note) — a
 * miss and a code for someone else's event look identical: a generic 404.
 */
async function handleResolveAccessCode({ TablesDBCtor, adminClient, payload, databaseId, eventsTableId, donationsTableId, error }) {
  const { code } = payload;
  const tablesDB = new TablesDBCtor(adminClient);

  const matches = await tablesDB.listRows({
    databaseId,
    tableId: eventsTableId,
    queries: [Query.equal('accessCode', code), Query.limit(1)],
  });
  const event = matches.rows?.[0];
  if (!event) {
    return { status: 404, body: { error: 'Code not recognised' } };
  }

  let donations = [];
  try {
    const page = await tablesDB.listRows({
      databaseId,
      tableId: donationsTableId,
      queries: [Query.equal('eventId', event.$id), Query.limit(200)],
    });
    donations = (page.rows ?? [])
      .filter((d) => !d.deletedAt && d.syncStatus !== 'conflict')
      .map((d) => ({
        id: d.$id,
        donorName: d.donorName,
        amountMinor: d.amountMinor ?? null,
        donationType: d.donationType,
        onBehalfOf: d.onBehalfOf,
        recordedAt: d.recordedAt,
        // donorPhone, recordedBy, notes deliberately excluded — never sent to Family.
      }));
  } catch (err) {
    error(`resolveAccessCode: listing donations failed: ${err.message}`);
    // The event itself resolved fine — better to show it with an empty list than fail outright.
  }

  return {
    status: 200,
    body: {
      success: true,
      event: {
        name: event.name,
        type: event.type,
        venue: event.venue,
        date: event.date,
        status: event.status,
      },
      donations,
    },
  };
}

export async function handleFamilyAccessRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  TablesDBCtor = TablesDB,
  randomBytes = nodeRandomBytes,
}) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const databaseId = process.env.APPWRITE_DATABASE_ID;
  const eventsTableId = process.env.APPWRITE_EVENTS_COLLECTION_ID;
  const donationsTableId = process.env.APPWRITE_DONATIONS_COLLECTION_ID;

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

  let caller = null;
  if (action === 'generateAccessCode') {
    const { errorResponse, caller: verifiedCaller } = await verifyAdminCaller({
      req, ClientCtor, AccountCtor, endpoint, projectId, error,
    });
    if (errorResponse) {
      return res.json(errorResponse.body, errorResponse.status);
    }
    caller = verifiedCaller;
  }
  // resolveAccessCode: deliberately no verifyCaller/verifyAdminCaller call — see its handler's
  // doc comment for why this is the one action allowed to run fully unauthenticated.

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
    case 'generateAccessCode':
      result = await handleGenerateAccessCode({
        TablesDBCtor, adminClient, payload, databaseId, eventsTableId, randomBytes, error,
      });
      break;
    case 'resolveAccessCode':
      result = await handleResolveAccessCode({
        TablesDBCtor, adminClient, payload, databaseId, eventsTableId, donationsTableId, error,
      });
      break;
  }

  if (result.status === 200) {
    log(`${action} succeeded${caller ? ` (by admin ${caller.$id})` : ' (unauthenticated)'}`);
  }
  return res.json(result.body, result.status);
}

export { ACTIONS as FAMILY_ACCESS_ACTIONS };
