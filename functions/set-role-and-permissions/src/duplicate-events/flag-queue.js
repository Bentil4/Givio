import { Query } from 'node-appwrite';
import { hasValue, listAllRows } from '../shared.js';
import { duplicateFlagTables, OPEN_FLAG_STATUS } from './flag-store.js';

export const DUPLICATE_FLAG_DECISIONS = { confirm: 'confirmed', clear: 'cleared' };

// Appwrite caps the values one equal() query may carry.
const MAX_IDS_PER_QUERY = 100;

const EVENT_COLUMNS = ['$id', 'name', 'hostName', 'type', 'date', 'venue', 'status', 'tenantId'];

/**
 * Story 7.4: Admin's queue for the Approvals screen's "Duplicate events" tab — every open flag
 * with both Events as they stand now and the name of the company that owns each.
 */
export async function listOpenDuplicateFlags(context) {
  try {
    const flags = await listOpenFlagRows(context);
    const events = await loadRowsById({
      ...context,
      ...eventLookup(),
      ids: flaggedEventIds(flags),
    });
    const tenants = await loadTenantsById({ ...context, events });
    const view = flags.map((flag) => toFlagView({ flag, events, tenants }));
    return { status: 200, body: { success: true, flags: view } };
  } catch (err) {
    context.error(`listDuplicateEventFlags: lookup failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to load duplicate-event flags' } };
  }
}

function listOpenFlagRows({ DatabasesCtor, adminClient }) {
  const { databaseId, flagsTableId } = duplicateFlagTables();
  return listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId,
    tableId: flagsTableId,
    queries: [Query.equal('status', [OPEN_FLAG_STATUS]), Query.orderDesc('flaggedAt')],
  });
}

function flaggedEventIds(flags) {
  return flags.flatMap((flag) => [flag.eventId, flag.matchedEventId]);
}

function eventLookup() {
  return { tableId: duplicateFlagTables().eventsTableId, columns: EVENT_COLUMNS };
}

function loadTenantsById({ events, ...context }) {
  const { tenantsTableId } = duplicateFlagTables();
  if (!hasValue(tenantsTableId)) {
    return new Map();
  }
  const ids = [...events.values()].map((event) => event.tenantId).filter(hasValue);
  return loadRowsById({ ...context, tableId: tenantsTableId, columns: ['$id', 'name'], ids });
}

/** Rows keyed by $id, read in chunks so a long queue never overflows one equal() query. */
async function loadRowsById({ DatabasesCtor, adminClient, tableId, columns, ids }) {
  const { databaseId } = duplicateFlagTables();
  const chunks = chunked([...new Set(ids)], MAX_IDS_PER_QUERY);
  const pages = await Promise.all(
    chunks.map((chunk) =>
      listAllRows({
        DatabasesCtor,
        adminClient,
        databaseId,
        tableId,
        queries: [Query.equal('$id', chunk), Query.select(columns)],
      }),
    ),
  );
  return new Map(pages.flat().map((row) => [row.$id, row]));
}

function chunked(items, size) {
  const count = Math.ceil(items.length / size);
  return Array.from({ length: count }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function toFlagView({ flag, events, tenants }) {
  return {
    flagId: flag.$id,
    matchedOn: flag.matchedOn ?? [],
    flaggedAt: flag.flaggedAt,
    event: toEventView(flag.eventId, { events, tenants }),
    matchedEvent: toEventView(flag.matchedEventId, { events, tenants }),
  };
}

// An Event is never hard-deleted, but the flag still renders if one somehow can't be read.
function toEventView(eventId, { events, tenants }) {
  const event = events.get(eventId) ?? {};
  const tenantId = event.tenantId ?? null;
  return {
    id: eventId,
    name: event.name ?? null,
    hostName: event.hostName ?? null,
    type: event.type ?? null,
    date: event.date ?? null,
    venue: event.venue ?? null,
    status: event.status ?? null,
    tenantId,
    tenantName: tenantId ? (tenants.get(tenantId)?.name ?? null) : null,
  };
}

/**
 * Story 7.4: Admin's decision on one flag. Confirm and clear both close it — neither touches
 * the Events themselves (Admin acts on a genuine duplicate through the ordinary Event and
 * Tenant tools) — and the pair's unique key keeps a closed flag from ever being re-raised.
 */
export async function resolveDuplicateFlag(context) {
  const loaded = await loadFlag(context);
  if (loaded.errorResponse) {
    return loaded.errorResponse;
  }
  if (loaded.flag.status !== OPEN_FLAG_STATUS) {
    return { status: 409, body: { error: `This flag is already ${loaded.flag.status}` } };
  }
  return saveFlagDecision({
    ...context,
    status: DUPLICATE_FLAG_DECISIONS[context.payload.decision],
  });
}

async function loadFlag({ DatabasesCtor, adminClient, payload, error }) {
  const { databaseId, flagsTableId } = duplicateFlagTables();
  try {
    const flag = await new DatabasesCtor(adminClient).getRow({
      databaseId,
      tableId: flagsTableId,
      rowId: payload.flagId,
    });
    return { flag };
  } catch (err) {
    error(`resolveDuplicateEventFlag: flag ${payload.flagId} not found: ${err.message}`);
    return { errorResponse: { status: 404, body: { error: 'Flag not found' } } };
  }
}

async function saveFlagDecision({ DatabasesCtor, adminClient, payload, caller, status, error }) {
  const { databaseId, flagsTableId } = duplicateFlagTables();
  try {
    await new DatabasesCtor(adminClient).updateRow({
      databaseId,
      tableId: flagsTableId,
      rowId: payload.flagId,
      data: { status, reviewedBy: caller.$id, reviewedAt: new Date().toISOString() },
    });
  } catch (err) {
    error(`resolveDuplicateEventFlag: saving ${payload.flagId} failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to save your decision' } };
  }
  return { status: 200, body: { success: true, flagId: payload.flagId, status } };
}
