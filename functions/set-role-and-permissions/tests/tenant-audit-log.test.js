import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantAuditRequest, TENANT_AUDIT_PAGE_SIZE } from '../src/tenant-audit.js';
import { handleTenantEventsRequest } from '../src/tenant-events.js';
import { fakeContext, seedStore, withEnv, NEW_EVENT } from './helpers/tenant-events-fixtures.js';

const LIST = { action: 'listTenantAuditLog' };

function auditRow(id, tenantId, minute = 0) {
  return {
    $id: id,
    entityType: 'event',
    entityId: `event-${id}`,
    action: 'edit',
    performedBy: 'org-a',
    previousValues: '{}',
    newValues: '{}',
    timestamp: `2026-10-01T10:${String(minute).padStart(2, '0')}:00.000Z`,
    ...(tenantId ? { tenantId } : {}),
  };
}

function storeWithAuditRows(rows) {
  const store = seedStore();
  store['audit-1'] = Object.fromEntries(rows.map((row) => [row.$id, row]));
  return store;
}

async function list({ as, body = LIST, store, ...options }) {
  const context = fakeContext({ body, as, store, ...options });
  const result = await handleTenantAuditRequest(context.ctx);
  return { result, ...context };
}

const ids = (result) => result.body.entries.map((entry) => entry.$id);

test(
  "a Super Organizer sees only their own tenant's entries",
  withEnv(async () => {
    const store = storeWithAuditRows([
      auditRow('a1', 'tenant-a'),
      auditRow('b1', 'tenant-b'),
      auditRow('legacy', undefined),
    ]);
    const { result, calls } = await list({ as: 'so-a', store });

    assert.equal(result.status, 200);
    assert.deepEqual(ids(result), ['a1']);
    assert.equal(result.body.nextCursor, null);
    const { queries } = calls.listRows.filter((call) => call.tableId === 'audit-1').at(-1);
    assert.ok(queries.includes('{"method":"equal","attribute":"tenantId","values":["tenant-a"]}'));
  }),
);

test(
  'a client-sent tenantId naming another tenant is refused, not honoured',
  withEnv(async () => {
    const store = storeWithAuditRows([auditRow('b1', 'tenant-b')]);
    const { result } = await list({ as: 'so-a', store, body: { ...LIST, tenantId: 'tenant-b' } });

    assert.equal(result.status, 403);
  }),
);

test(
  'co-Organizers, Operators, Admin and non-members are refused',
  withEnv(async () => {
    for (const as of ['org-a', 'op-a', 'admin-1', 'nobody', 'gone-a']) {
      const { result, calls } = await list({ as, store: storeWithAuditRows([]) });
      assert.equal(result.status, 403, as);
      const auditReads = (calls.listRows ?? []).filter((call) => call.tableId === 'audit-1');
      assert.equal(auditReads.length, 0, as);
    }
  }),
);

test(
  "a pending, rejected or suspended tenant's Super Organizer is refused",
  withEnv(async () => {
    for (const as of ['so-p', 'so-r', 'so-s']) {
      const { result } = await list({ as, store: storeWithAuditRows([]) });
      assert.equal(result.status, 403, as);
    }
  }),
);

test(
  'an unauthenticated call is refused with 401',
  withEnv(async () => {
    const { result } = await list({ as: 'so-a', headers: { 'x-appwrite-key': 'dynamic-key' } });

    assert.equal(result.status, 401);
  }),
);

test(
  'an empty trail answers 200 with no entries',
  withEnv(async () => {
    const { result } = await list({ as: 'so-a', store: storeWithAuditRows([]) });

    assert.deepEqual(result.body, { success: true, entries: [], nextCursor: null });
  }),
);

test(
  'a full page hands back a cursor, and the cursor is sent on the next call',
  withEnv(async () => {
    const rows = Array.from({ length: TENANT_AUDIT_PAGE_SIZE + 1 }, (_, i) =>
      auditRow(`a${i}`, 'tenant-a', i),
    );
    const first = await list({ as: 'so-a', store: storeWithAuditRows(rows) });

    assert.equal(first.result.body.entries.length, TENANT_AUDIT_PAGE_SIZE);
    assert.equal(first.result.body.nextCursor, `a${TENANT_AUDIT_PAGE_SIZE - 1}`);

    const body = { ...LIST, cursor: first.result.body.nextCursor };
    const second = await list({ as: 'so-a', store: storeWithAuditRows(rows), body });
    const { queries } = second.calls.listRows.at(-1);
    assert.ok(queries.some((q) => JSON.parse(q).method === 'cursorAfter'));
  }),
);

test(
  'a malformed cursor is rejected with 400',
  withEnv(async () => {
    const { result } = await list({ as: 'so-a', body: { ...LIST, cursor: '../../x' } });

    assert.equal(result.status, 400);
  }),
);

test(
  'a failed audit query answers 502',
  withEnv(async () => {
    const store = storeWithAuditRows([]);
    const context = fakeContext({ body: LIST, as: 'so-a', store });
    const original = context.ctx.DatabasesCtor;
    context.ctx.DatabasesCtor = class extends original {
      async listRows(args) {
        if (args.tableId === 'audit-1') throw new Error('boom');
        return super.listRows(args);
      }
    };
    const result = await handleTenantAuditRequest(context.ctx);

    assert.equal(result.status, 502);
  }),
);

test(
  "an Organizer's Function-written event entry carries the tenantId column",
  withEnv(async () => {
    const context = fakeContext({ body: NEW_EVENT, as: 'org-a' });
    await handleTenantEventsRequest(context.ctx);

    const [entry] = Object.values(context.store['audit-1']);
    assert.equal(entry.tenantId, 'tenant-a');
  }),
);

test(
  'an entry written by an Organizer is then listed for their Super Organizer',
  withEnv(async () => {
    const store = seedStore();
    await handleTenantEventsRequest(fakeContext({ body: NEW_EVENT, as: 'org-a', store }).ctx);
    const { result } = await list({ as: 'so-a', store });
    const other = await list({ as: 'so-b', store });

    assert.equal(result.body.entries.length, 1);
    assert.equal(result.body.entries[0].performedBy, 'org-a');
    assert.equal(other.result.body.entries.length, 0);
  }),
);
