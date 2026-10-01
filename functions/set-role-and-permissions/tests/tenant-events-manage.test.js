import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantEventsRequest } from '../src/tenant-events.js';
import { fakeContext, withEnv, auditRows } from './helpers/tenant-events-fixtures.js';

async function run({ as, body, ...options }) {
  const context = fakeContext({ body, as, ...options });
  const result = await handleTenantEventsRequest(context.ctx);
  return { result, ...context };
}

const edit = (eventId, extra = { name: 'Renamed Service' }) => ({
  action: 'updateTenantEvent',
  eventId,
  ...extra,
});

const setStatus = (eventId, status) => ({ action: 'setTenantEventStatus', eventId, status });

test(
  'an Organizer edits their own Event and the change is audit-logged',
  withEnv(async () => {
    const { result, store } = await run({ as: 'org-a', body: edit('event-a1') });

    assert.equal(result.status, 200);
    assert.equal(store['events-1']['event-a1'].name, 'Renamed Service');
    const [entry] = auditRows(store);
    assert.equal(entry.action, 'edit');
    assert.equal(entry.performedBy, 'org-a');
    assert.deepEqual(entry.previousValues, { name: 'Event event-a1' });
    assert.deepEqual(entry.newValues, { name: 'Renamed Service', tenantId: 'tenant-a' });
  }),
);

test(
  'type and tenantId are not editable',
  withEnv(async () => {
    const body = edit('event-a1', { type: 'wedding', tenantId: 'tenant-a', venue: 'Hall' });
    const { result, store } = await run({ as: 'so-a', body });

    assert.equal(result.status, 200);
    const row = store['events-1']['event-a1'];
    assert.equal(row.type, 'funeral');
    assert.equal(row.venue, 'Hall');
  }),
);

test(
  'an edit with no editable field is rejected with 400',
  withEnv(async () => {
    const { result } = await run({ as: 'so-a', body: edit('event-a1', { type: 'wedding' }) });

    assert.equal(result.status, 400);
  }),
);

test(
  'a closed Event cannot be edited',
  withEnv(async () => {
    const { result, calls } = await run({ as: 'so-a', body: edit('event-a-closed') });

    assert.equal(result.status, 400);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  "another tenant's Event, an Admin Event and a missing one all answer the same 404",
  withEnv(async () => {
    const bodies = [];
    for (const eventId of ['event-b1', 'event-admin', 'no-such-event']) {
      const { result, calls } = await run({ as: 'so-a', body: edit(eventId) });
      assert.equal(calls.updateRow, undefined);
      bodies.push({ status: result.status, body: result.body });
    }

    assert.deepEqual(bodies[0], { status: 404, body: { error: 'Event not found' } });
    assert.deepEqual(bodies[1], bodies[0]);
    assert.deepEqual(bodies[2], bodies[0]);
  }),
);

test(
  "a suspended tenant's Organizer cannot edit",
  withEnv(async () => {
    const { result } = await run({ as: 'so-s', body: edit('event-a1') });

    assert.equal(result.status, 403);
  }),
);

test(
  'pause, resume, close and reopen follow Story 2.2 and are audit-logged',
  withEnv(async () => {
    const { store } = await run({ as: 'so-a', body: setStatus('event-a1', 'paused') });
    for (const status of ['active', 'closed', 'active']) {
      const context = fakeContext({ body: setStatus('event-a1', status), as: 'so-a', store });
      const result = await handleTenantEventsRequest(context.ctx);
      assert.equal(result.status, 200);
    }

    assert.equal(store['events-1']['event-a1'].status, 'active');
    const statuses = auditRows(store).map((e) => [e.previousValues.status, e.newValues.status]);
    assert.equal(statuses.length, 4);
    assert.ok(statuses.some(([from, to]) => from === 'closed' && to === 'active'));
  }),
);

test(
  'a disallowed transition (closed to paused) is rejected',
  withEnv(async () => {
    const { result, calls } = await run({
      as: 'so-a',
      body: setStatus('event-a-closed', 'paused'),
    });

    assert.equal(result.status, 400);
    assert.match(result.body.error, /Cannot change status from closed to paused/);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  "status changes on another tenant's Event answer 404",
  withEnv(async () => {
    const { result, calls } = await run({ as: 'so-a', body: setStatus('event-b1', 'paused') });

    assert.equal(result.status, 404);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'an unknown status value is rejected with 400',
  withEnv(async () => {
    const { result } = await run({ as: 'so-a', body: setStatus('event-a1', 'draft') });

    assert.equal(result.status, 400);
  }),
);
