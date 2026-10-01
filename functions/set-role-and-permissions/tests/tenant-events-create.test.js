import { test } from 'node:test';
import assert from 'node:assert/strict';
import main from '../src/main.js';
import { handleTenantEventsRequest } from '../src/tenant-events.js';
import { fakeContext, withEnv, auditRows, NEW_EVENT } from './helpers/tenant-events-fixtures.js';

async function create({ as, body = NEW_EVENT, ...options }) {
  const context = fakeContext({ body, as, ...options });
  const result = await handleTenantEventsRequest(context.ctx);
  return { result, ...context };
}

function createdEvent(store) {
  return Object.values(store['events-1']).find((e) => e.name === NEW_EVENT.name);
}

test(
  'a Super Organizer creates an Event stamped with their own tenant',
  withEnv(async () => {
    const { result, store } = await create({ as: 'so-a' });

    assert.equal(result.status, 200);
    const row = createdEvent(store);
    assert.equal(row.tenantId, 'tenant-a');
    assert.equal(row.createdBy, 'so-a');
    assert.equal(row.status, 'active');
    assert.equal(row.id, row.$id);
    assert.deepEqual(row.assignedUserIds, []);
    assert.equal(result.body.event.$id, row.$id);
  }),
);

test(
  'a co-Organizer can create Events too',
  withEnv(async () => {
    const { result, store } = await create({ as: 'org-a' });

    assert.equal(result.status, 200);
    assert.equal(createdEvent(store).tenantId, 'tenant-a');
  }),
);

test(
  "the new Event's permissions follow AD-2: Admin plus every organizer-tier member, no Operator",
  withEnv(async () => {
    const { store } = await create({ as: 'so-a' });

    const permissions = createdEvent(store).$permissions;
    assert.ok(permissions.includes('read("label:admin")'));
    assert.ok(permissions.includes('update("label:admin")'));
    assert.ok(permissions.includes('read("user:so-a")'));
    assert.ok(permissions.includes('read("user:org-a")'));
    assert.ok(!permissions.some((p) => p.includes('op-a') || p.includes('so-b')));
  }),
);

test(
  'server-owned fields in the payload are ignored',
  withEnv(async () => {
    const body = {
      ...NEW_EVENT,
      status: 'closed',
      createdBy: 'someone-else',
      assignedUserIds: ['op-b'],
      accessCode: 'ABCDEFGH',
    };
    const { result, store } = await create({ as: 'so-a', body });

    assert.equal(result.status, 200);
    const row = createdEvent(store);
    assert.equal(row.status, 'active');
    assert.equal(row.createdBy, 'so-a');
    assert.deepEqual(row.assignedUserIds, []);
    assert.equal(row.accessCode, undefined);
  }),
);

test(
  'a client-supplied tenantId naming another tenant is refused, never used',
  withEnv(async () => {
    const { result, calls } = await create({
      as: 'so-a',
      body: { ...NEW_EVENT, tenantId: 'tenant-b' },
    });

    assert.equal(result.status, 403);
    assert.equal(calls.createRow, undefined);
  }),
);

for (const as of ['so-p', 'so-r', 'so-s']) {
  test(
    `a member of a non-approved tenant (${as}) is refused server-side`,
    withEnv(async () => {
      const { result, calls } = await create({ as });

      assert.equal(result.status, 403);
      assert.equal(calls.createRow, undefined);
    }),
  );
}

for (const as of ['admin-1', 'op-a', 'nobody']) {
  test(
    `${as} cannot use the Organizer create action`,
    withEnv(async () => {
      const { result, calls } = await create({ as });

      assert.equal(result.status, 403);
      assert.equal(calls.createRow, undefined);
    }),
  );
}

test(
  'an unauthenticated request gets 401',
  withEnv(async () => {
    const { result } = await create({ as: 'so-a', headers: { 'x-appwrite-key': 'dynamic-key' } });

    assert.equal(result.status, 401);
  }),
);

for (const [label, body] of [
  ['a missing name', { ...NEW_EVENT, name: '' }],
  ['an unknown type', { ...NEW_EVENT, type: 'party' }],
  ['an invalid date', { ...NEW_EVENT, date: 'not-a-date' }],
  ['an over-long venue', { ...NEW_EVENT, venue: 'x'.repeat(161) }],
]) {
  test(
    `rejects ${label} with 400`,
    withEnv(async () => {
      const { result, calls } = await create({ as: 'so-a', body });

      assert.equal(result.status, 400);
      assert.equal(calls.createRow, undefined);
    }),
  );
}

test(
  'fails closed with 502 when the Membership lookup fails',
  withEnv(async () => {
    const { result, calls } = await create({ as: 'so-a', failOn: { listRows: true } });

    assert.equal(result.status, 502);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'the creation is audit-logged server-side with the whole new Event',
  withEnv(async () => {
    const { store } = await create({ as: 'so-a' });

    const [entry] = auditRows(store);
    assert.equal(entry.entityType, 'event');
    assert.equal(entry.action, 'create');
    assert.equal(entry.performedBy, 'so-a');
    assert.equal(entry.entityId, createdEvent(store).$id);
    assert.equal(entry.previousValues, null);
    assert.equal(entry.newValues.name, NEW_EVENT.name);
    assert.equal(entry.newValues.tenantId, 'tenant-a');
  }),
);

test(
  'a missing audit table is logged but never fails the creation',
  withEnv(
    async () => {
      const { result, errors } = await create({ as: 'so-a' });

      assert.equal(result.status, 200);
      assert.ok(errors.some((e) => e.includes('APPWRITE_AUDIT_LOGS_COLLECTION_ID')));
    },
    { APPWRITE_AUDIT_LOGS_COLLECTION_ID: undefined },
  ),
);

test(
  'main.js routes createTenantEvent to the Organizer events module',
  withEnv(async () => {
    const { ctx, store } = fakeContext({ body: NEW_EVENT, as: 'so-a' });

    const result = await main(ctx);

    assert.equal(result.status, 200);
    assert.equal(createdEvent(store).tenantId, 'tenant-a');
  }),
);
