import { test } from 'node:test';
import assert from 'node:assert/strict';
import main from '../src/main.js';
import {
  event,
  fakeRequestContext,
  seedStore,
  withEnv,
} from './helpers/duplicate-events-fixtures.js';

const flag = (id, extra) => ({
  $id: id,
  pairKey: `${id}-a:${id}-b`,
  eventId: 'event-new',
  matchedEventId: 'event-rival',
  tenantId: 'tenant-a',
  matchedTenantId: 'tenant-b',
  matchedOn: ['name'],
  status: 'open',
  flaggedAt: '2026-10-01T09:00:00.000Z',
  reviewedBy: null,
  reviewedAt: null,
  ...extra,
});

function storeWithFlags(flags) {
  const store = seedStore([
    event('event-new', { tenantId: 'tenant-a' }),
    event('event-rival', { tenantId: 'tenant-b', name: 'Kwame Mensah Burial' }),
  ]);
  store['flags-1'] = Object.fromEntries(flags.map((row) => [row.$id, row]));
  return store;
}

async function call({ body, as = 'admin-1', store = storeWithFlags([flag('f1')]), ...rest }) {
  const context = fakeRequestContext({ body, as, store, ...rest });
  const result = await main(context.ctx);
  return { result, ...context };
}

const LIST = { action: 'listDuplicateEventFlags' };
const resolve = (decision, flagId = 'f1') => ({
  action: 'resolveDuplicateEventFlag',
  flagId,
  decision,
});

test(
  'Admin lists open flags with both Events and their companies',
  withEnv(async () => {
    const store = storeWithFlags([flag('f1'), flag('f2', { status: 'cleared' })]);
    const { result } = await call({ body: LIST, store });

    assert.equal(result.status, 200);
    assert.equal(result.body.flags.length, 1);
    const [view] = result.body.flags;
    assert.equal(view.flagId, 'f1');
    assert.deepEqual(view.matchedOn, ['name']);
    assert.equal(view.event.name, 'Funeral of the Late Mr Kwame Mensah');
    assert.equal(view.event.tenantName, 'Asante Events');
    assert.equal(view.matchedEvent.name, 'Kwame Mensah Burial');
    assert.equal(view.matchedEvent.tenantName, 'Mensah Funeral Services');
    assert.equal(view.matchedEvent.date, '2026-11-07T00:00:00.000+00:00');
  }),
);

test(
  'an Admin-created Event in a flag has no company name, and an empty queue is empty',
  withEnv(async () => {
    const store = storeWithFlags([flag('f1')]);
    store['events-1']['event-rival'].tenantId = undefined;
    const listed = await call({ body: LIST, store });
    const empty = await call({ body: LIST, store: storeWithFlags([]) });

    assert.equal(listed.result.body.flags[0].matchedEvent.tenantId, null);
    assert.equal(listed.result.body.flags[0].matchedEvent.tenantName, null);
    assert.deepEqual(empty.result.body.flags, []);
  }),
);

for (const [decision, status] of [
  ['confirm', 'confirmed'],
  ['clear', 'cleared'],
]) {
  test(
    `${decision} resolves the flag, records who and when, and drops it from the queue`,
    withEnv(async () => {
      const store = storeWithFlags([flag('f1')]);
      const { result } = await call({ body: resolve(decision), store });
      const after = await call({ body: LIST, store });

      assert.equal(result.status, 200);
      assert.equal(result.body.status, status);
      assert.equal(store['flags-1'].f1.status, status);
      assert.equal(store['flags-1'].f1.reviewedBy, 'admin-1');
      assert.ok(store['flags-1'].f1.reviewedAt);
      assert.deepEqual(after.result.body.flags, []);
    }),
  );
}

test(
  'a flag already resolved is refused, and an unknown one is not found',
  withEnv(async () => {
    const store = storeWithFlags([flag('f1', { status: 'cleared' })]);
    const resolved = await call({ body: resolve('confirm'), store });
    const missing = await call({ body: resolve('clear', 'nope'), store });

    assert.equal(resolved.result.status, 409);
    assert.equal(store['flags-1'].f1.status, 'cleared');
    assert.equal(missing.result.status, 404);
  }),
);

test(
  'only Admin may list or resolve flags',
  withEnv(async () => {
    const organizer = await call({ body: LIST, as: 'so-a' });
    const operator = await call({ body: resolve('clear'), as: 'op-a' });
    const anonymous = await call({ body: LIST, headers: { 'x-appwrite-key': 'k' } });

    assert.equal(organizer.result.status, 403);
    assert.equal(operator.result.status, 403);
    assert.equal(anonymous.result.status, 401);
  }),
);

test(
  'a resolve needs a flagId and a known decision',
  withEnv(async () => {
    const noFlag = await call({ body: { action: 'resolveDuplicateEventFlag', decision: 'clear' } });
    const badDecision = await call({ body: resolve('delete') });

    assert.equal(noFlag.result.status, 400);
    assert.equal(badDecision.result.status, 400);
    assert.match(badDecision.result.body.error, /confirm, clear/);
  }),
);

test(
  'without the flags table configured the actions report a misconfiguration',
  withEnv(
    async () => {
      const { result } = await call({ body: LIST });

      assert.equal(result.status, 500);
    },
    { APPWRITE_DUPLICATE_EVENT_FLAGS_COLLECTION_ID: undefined },
  ),
);

test(
  'a failed lookup or save is a 502, and the flag stays open',
  withEnv(async () => {
    const store = storeWithFlags([flag('f1')]);
    const listFails = await call({ body: LIST, store, failOn: { listRows: true } });
    const saveFails = await call({ body: resolve('clear'), store, failOn: { updateRow: true } });

    assert.equal(listFails.result.status, 502);
    assert.equal(saveFails.result.status, 502);
    assert.equal(store['flags-1'].f1.status, 'open');
  }),
);
