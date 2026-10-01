import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDuplicateEventCheck } from '../src/tenant-events/duplicate-event-check.js';
import { handleTenantEventsRequest } from '../src/tenant-events.js';
import * as tenantEvents from './helpers/tenant-events-fixtures.js';
import {
  event,
  fakeDatabases,
  flagRows,
  seedStore,
  withEnv,
} from './helpers/duplicate-events-fixtures.js';

const NEW_EVENT = event('event-new', { tenantId: 'tenant-a' });
const RIVAL = event('event-rival', {
  tenantId: 'tenant-b',
  name: 'Kwame Mensah Burial Service',
  date: '2026-11-10T00:00:00.000+00:00',
});

async function check({ store, failOn = {}, created = NEW_EVENT } = {}) {
  const calls = {};
  const errors = [];
  store['events-1'][created.$id] = created;
  await runDuplicateEventCheck({
    DatabasesCtor: fakeDatabases(store, calls, failOn),
    adminClient: {},
    event: created,
    error: (msg) => errors.push(msg),
  });
  return { calls, errors };
}

test(
  "a new Event matching another tenant's Event raises one open, Admin-only flag",
  withEnv(async () => {
    const store = seedStore([RIVAL]);
    const { errors } = await check({ store });

    const [flag] = flagRows(store);
    assert.equal(flagRows(store).length, 1);
    assert.equal(flag.pairKey, 'event-new:event-rival');
    assert.equal(flag.eventId, 'event-new');
    assert.equal(flag.matchedEventId, 'event-rival');
    assert.equal(flag.tenantId, 'tenant-a');
    assert.equal(flag.matchedTenantId, 'tenant-b');
    assert.deepEqual(flag.matchedOn, ['name', 'hostName']);
    assert.equal(flag.status, 'open');
    assert.deepEqual(flag.$permissions, ['read("label:admin")']);
    assert.deepEqual(errors, []);
  }),
);

test(
  'candidates are read by type and date window, never the whole events table',
  withEnv(async () => {
    const { calls } = await check({ store: seedStore([RIVAL]) });

    const queries = calls.listRows[0].queries.map((q) => JSON.parse(q));
    assert.deepEqual(queries[0], { method: 'equal', attribute: 'type', values: ['funeral'] });
    assert.equal(queries[1].method, 'between');
    assert.equal(queries[1].attribute, 'date');
    assert.deepEqual(queries[2], { method: 'notEqual', attribute: '$id', values: ['event-new'] });
  }),
);

test(
  'an unrelated, same-tenant or out-of-window Event raises nothing',
  withEnv(async () => {
    const store = seedStore([
      event('other-person', { tenantId: 'tenant-b', name: 'Ama Owusu', hostName: 'Owusu' }),
      event('own-reschedule', { tenantId: 'tenant-a' }),
      event('months-later', { tenantId: 'tenant-b', date: '2027-02-01T00:00:00.000+00:00' }),
    ]);
    await check({ store });

    assert.deepEqual(flagRows(store), []);
  }),
);

test(
  'a pair already flagged — even one Admin cleared — is never flagged again',
  withEnv(async () => {
    const store = seedStore([RIVAL]);
    store['flags-1'].cleared = {
      $id: 'cleared',
      pairKey: 'event-new:event-rival',
      status: 'cleared',
    };
    const { errors } = await check({ store });

    assert.deepEqual(flagRows(store), [store['flags-1'].cleared]);
    assert.deepEqual(errors, []);
  }),
);

test(
  'each matching Event gets its own flag',
  withEnv(async () => {
    const store = seedStore([RIVAL, event('admin-copy', { tenantId: undefined })]);
    await check({ store });

    const matched = flagRows(store).map((flag) => flag.matchedEventId);
    assert.deepEqual(matched.sort(), ['admin-copy', 'event-rival']);
  }),
);

test(
  'without the flags table configured the check logs and does nothing',
  withEnv(
    async () => {
      const store = seedStore([RIVAL]);
      const { calls, errors } = await check({ store });

      assert.equal(calls.listRows, undefined);
      assert.ok(errors.some((e) => e.includes('skipped') && e.includes('event-new')));
    },
    { APPWRITE_DUPLICATE_EVENT_FLAGS_COLLECTION_ID: undefined },
  ),
);

test(
  'a failed lookup or flag write is logged, never thrown',
  withEnv(async () => {
    const lookupFails = await check({ store: seedStore([RIVAL]), failOn: { listRows: true } });
    const writeFails = await check({ store: seedStore([RIVAL]), failOn: { createRow: true } });

    assert.ok(lookupFails.errors.some((e) => e.includes('duplicate-event check failed')));
    assert.ok(writeFails.errors.some((e) => e.includes('duplicate-event flag for event-new')));
  }),
);

const ORGANIZER_CREATE_ENV = { APPWRITE_DUPLICATE_EVENT_FLAGS_COLLECTION_ID: 'flags-1' };

function storeWithRival() {
  const store = { ...tenantEvents.seedStore(), 'flags-1': {} };
  store['events-1']['event-rival'] = event('event-rival', {
    tenantId: 'tenant-b',
    name: 'Odoi Funeral Service',
    hostName: 'The Odoi Family',
    date: '2026-11-04T00:00:00.000+00:00',
  });
  return store;
}

test(
  'an Organizer creating a duplicate still gets their Event; the flag is raised alongside',
  tenantEvents.withEnv(async () => {
    const { ctx, store } = tenantEvents.fakeContext({
      body: tenantEvents.NEW_EVENT,
      as: 'so-a',
      store: storeWithRival(),
    });
    const result = await handleTenantEventsRequest(ctx);

    assert.equal(result.status, 200);
    const [flag] = Object.values(store['flags-1']);
    assert.equal(flag.eventId, result.body.event.$id);
    assert.equal(flag.matchedEventId, 'event-rival');
  }, ORGANIZER_CREATE_ENV),
);

test(
  'an Organizer create succeeds even when the duplicate check cannot run',
  tenantEvents.withEnv(async () => {
    const { ctx, store } = tenantEvents.fakeContext({
      body: tenantEvents.NEW_EVENT,
      as: 'so-a',
      store: storeWithRival(),
    });
    const result = await handleTenantEventsRequest(ctx);

    assert.equal(result.status, 200);
    assert.deepEqual(store['flags-1'], {});
  }),
);
