import { Client, Account, Users, TablesDB, Query } from 'node-appwrite';
import {
  buildClient,
  verifyAdminCaller,
  VALID,
  invalid,
  hasValue,
  computeEventPermissions,
  listAllRows,
} from './shared.js';

const ACTIONS = ['assignOperators', 'setEventStatus'];

const EVENT_STATUSES = ['active', 'paused', 'closed'];

// Story 2.2: pause/resume/close are the forward transitions; a Closed event can only be
// reopened back to Active, never straight to Paused — the Admin must resume it first.
const ALLOWED_TRANSITIONS = {
  active: ['paused', 'closed'],
  paused: ['active', 'closed'],
  closed: ['active'],
};

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
  setEventStatus: ({ eventId, status }) => {
    if (!hasValue(eventId)) {
      return invalid('Request must include eventId');
    }
    if (!EVENT_STATUSES.includes(status)) {
      return invalid(`Request must include status as one of: ${EVENT_STATUSES.join(', ')}`);
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
 * Story 6.2 (AD-2 amended): filters assignedUserIds down to only uids that are actually
 * grant-eligible for this Event's tenant before computeEventPermissions ever sees them — a
 * uid is silently excluded (never an error) if it has no Membership row for the Event's own
 * tenantId, or that Membership isn't 'active', or the Tenant itself isn't 'approved'.
 * `assignedUserIds` itself is left untouched by this filter; only the *permission grant*
 * derived from it is narrowed. The Tenant.status check (not just Membership.status) is what
 * keeps a suspended/rejected tenant's uid from being silently re-granted by a later,
 * unrelated assignedUserIds edit — see Story 6.2 Dev Notes ("Why the grant-check also checks
 * Tenant.status"). An Event with no tenantId (still-Admin-created events, pre-Story-6.2 or
 * before an Organizer-tier creation flow exists) skips the filter entirely — every uid passes
 * through unchanged, preserving today's Admin-only behavior exactly.
 */
async function filterTenantMatchedUserIds({
  DatabasesCtor,
  adminClient,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  tenantId,
  assignedUserIds,
  error,
}) {
  if (!hasValue(tenantId) || assignedUserIds.length === 0) {
    return assignedUserIds;
  }
  // A tenant-owned Event requires the tenant/membership collections to be configured — fail
  // closed (grant nobody) rather than silently falling back to ungated legacy behavior, which
  // would puncture FR-2's isolation guarantee the moment a real tenant-owned Event exists.
  if (!hasValue(tenantsCollectionId) || !hasValue(membershipsCollectionId)) {
    error(
      'filterTenantMatchedUserIds: tenant-owned Event but APPWRITE_TENANTS_COLLECTION_ID/APPWRITE_MEMBERSHIPS_COLLECTION_ID are not configured — denying all grants.',
    );
    return [];
  }

  const databases = new DatabasesCtor(adminClient);

  let tenant;
  try {
    tenant = await databases.getRow({ databaseId, tableId: tenantsCollectionId, rowId: tenantId });
  } catch (err) {
    error(`filterTenantMatchedUserIds: tenant ${tenantId} not found: ${err.message}`);
    return [];
  }
  if (tenant.status !== 'approved') {
    return [];
  }

  let membershipRows;
  try {
    membershipRows = await listAllRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: membershipsCollectionId,
      queries: [Query.equal('tenantId', [tenantId]), Query.equal('userId', assignedUserIds)],
    });
  } catch (err) {
    error(`filterTenantMatchedUserIds: memberships lookup failed: ${err.message}`);
    return [];
  }

  const activeTenantMatchedUserIds = new Set(
    membershipRows.filter((m) => m.status === 'active').map((m) => m.userId),
  );
  return assignedUserIds.filter((userId) => activeTenantMatchedUserIds.has(userId));
}

async function handleAssignOperators({
  DatabasesCtor,
  adminClient,
  payload,
  databaseId,
  eventsCollectionId,
  tenantsCollectionId,
  membershipsCollectionId,
  error,
}) {
  const { eventId, assignedUserIds } = payload;
  const databases = new DatabasesCtor(adminClient);

  let event;
  try {
    event = await databases.getRow({ databaseId, tableId: eventsCollectionId, rowId: eventId });
  } catch (err) {
    error(`assignOperators: event ${eventId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Event not found' } };
  }

  const grantEligibleUserIds = await filterTenantMatchedUserIds({
    DatabasesCtor,
    adminClient,
    databaseId,
    tenantsCollectionId,
    membershipsCollectionId,
    tenantId: event.tenantId,
    assignedUserIds,
    error,
  });

  try {
    await databases.updateRow({
      databaseId,
      tableId: eventsCollectionId,
      rowId: eventId,
      data: { assignedUserIds },
      permissions: computeEventPermissions(grantEligibleUserIds),
    });
  } catch (err) {
    error(`assignOperators: updateRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to save operator assignment' } };
  }

  return { status: 200, body: { success: true, eventId, assignedUserIds } };
}

/**
 * Story 2.2: the sole writer of Event.status. Routed through this Function (rather than a
 * direct client updateRow, which the Admin's own row permissions would otherwise allow) so
 * every transition is validated server-side against ALLOWED_TRANSITIONS in one place —
 * donation-recording.js already treats `status !== 'active'` as a trust-sensitive gate, so the
 * field itself is treated as trust-sensitive too, not just cosmetic.
 */
async function handleSetEventStatus({
  DatabasesCtor,
  payload,
  adminClient,
  databaseId,
  eventsCollectionId,
  error,
}) {
  const { eventId, status } = payload;
  const databases = new DatabasesCtor(adminClient);

  let current;
  try {
    current = await databases.getRow({ databaseId, tableId: eventsCollectionId, rowId: eventId });
  } catch (err) {
    error(`setEventStatus: event ${eventId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Event not found' } };
  }

  const from = current.status;
  if (from === status) {
    return { status: 400, body: { error: `Event is already ${status}` } };
  }
  if (!(ALLOWED_TRANSITIONS[from] ?? []).includes(status)) {
    return { status: 400, body: { error: `Cannot change status from ${from} to ${status}` } };
  }

  try {
    await databases.updateRow({
      databaseId,
      tableId: eventsCollectionId,
      rowId: eventId,
      data: { status },
    });
  } catch (err) {
    error(`setEventStatus: updateRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to save the status change' } };
  }

  return { status: 200, body: { success: true, eventId, status } };
}

/**
 * Extends the same trusted Function (AD-9) to also be the sole writer of
 * Event.assignedUserIds and the Appwrite document permissions derived from it (AD-2,
 * Story 2.3) — Databases document permissions can only be set with a server API key, never
 * from the client SDK, which is why this can't just be an EventDataService.updateEvent()
 * call. Also the sole writer of Event.status (Story 2.2) — see handleSetEventStatus's doc
 * comment for why that field is routed here too, despite the Admin's own row permissions
 * technically allowing a direct client write.
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
  // Story 6.2 — only assignOperators needs these (the tenant-matched grant filter).
  const tenantsCollectionId = process.env.APPWRITE_TENANTS_COLLECTION_ID;
  const membershipsCollectionId = process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;

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
    error(
      "Missing x-appwrite-key — the Function's execution API key scopes are likely misconfigured.",
    );
    return res.json({ error: 'Server misconfiguration: missing execution API key' }, 500);
  }

  if (!hasValue(databaseId) || !hasValue(eventsCollectionId)) {
    error('Missing APPWRITE_DATABASE_ID/APPWRITE_EVENTS_COLLECTION_ID function variables.');
    return res.json({ error: 'Server misconfiguration: missing database/collection ID' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);

  // Only assignOperators touches assignedUserIds — running this check for setEventStatus
  // would loop over an undefined assignedUserIds and throw before ever reaching its handler.
  if (action === 'assignOperators') {
    const operatorCheck = await rejectNonOperatorIds({
      UsersCtor,
      adminClient,
      assignedUserIds: payload.assignedUserIds,
      error,
    });
    if (!operatorCheck.valid) {
      return res.json(operatorCheck.body, 400);
    }
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
        tenantsCollectionId,
        membershipsCollectionId,
        error,
      });
      break;
    case 'setEventStatus':
      result = await handleSetEventStatus({
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
