import { test } from 'node:test';
import assert from 'node:assert/strict';
import main from '../src/main.js';
import { auditLogReadPermissions } from '../src/audit-log-grants.js';
import { handleTenantEventsRequest } from '../src/tenant-events.js';
import * as tenantEvents from './helpers/tenant-events-fixtures.js';
import { inMemoryStore, invoke, withEnv } from './helpers/tenant-read-grants-fixtures.js';

const ADMIN_READ = 'read("label:admin")';
const RECOMPUTE = { action: 'recomputeAuditLogReadGrants' };

function withAuditEnv(fn) {
  return withEnv(async () => {
    process.env.APPWRITE_AUDIT_LOGS_COLLECTION_ID = 'audit-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_AUDIT_LOGS_COLLECTION_ID;
    }
  });
}

const auditRow = (id, tenantId, permissions) => ({
  $id: id,
  entityType: 'donation',
  action: 'edit',
  ...(tenantId && { tenantId }),
  $permissions: permissions,
});

/** 120 rows (past one page): every other one a company entry, all still Admin-readable. */
function preAmendmentAuditStore() {
  const rows = Array.from({ length: 120 }, (_, i) =>
    auditRow(`a${String(i).padStart(3, '0')}`, i % 2 === 0 ? 'tenant-a' : null, [ADMIN_READ]),
  );
  return inMemoryStore({ 'audit-1': rows });
}

const recompute = (store, caller) => invoke(main, store, RECOMPUTE, caller);

test('a company audit entry is readable by nobody client-side; a platform entry by Admin', () => {
  assert.deepEqual(auditLogReadPermissions('tenant-a'), []);
  assert.deepEqual(auditLogReadPermissions(undefined), [ADMIN_READ]);
  assert.deepEqual(auditLogReadPermissions(null), [ADMIN_READ]);
});

test(
  "the Function's tenant audit writer gives a company entry no Admin read",
  tenantEvents.withEnv(async () => {
    const { ctx, store } = tenantEvents.fakeContext({ body: tenantEvents.NEW_EVENT, as: 'so-a' });

    await handleTenantEventsRequest(ctx);

    const [row] = Object.values(store['audit-1']);
    assert.equal(row.tenantId, 'tenant-a');
    assert.deepEqual(row.$permissions, []);
  }),
);

test(
  'recomputeAuditLogReadGrants rewrites every page by the tenantId rule',
  withAuditEnv(async () => {
    const store = preAmendmentAuditStore();

    const result = await recompute(store);

    assert.equal(result.status, 200);
    assert.equal(result.body.rowsScanned, 120);
    assert.equal(result.body.rowsUpdated, 60);
    for (const row of store.tables['audit-1']) {
      assert.deepEqual(row.$permissions, row.tenantId ? [] : [ADMIN_READ], row.$id);
    }
  }),
);

test(
  'recomputeAuditLogReadGrants is idempotent: a second run writes nothing',
  withAuditEnv(async () => {
    const store = preAmendmentAuditStore();
    await recompute(store);
    const writesAfterFirst = store.writes.length;

    const second = await recompute(store);

    assert.equal(second.status, 200);
    assert.equal(second.body.rowsUpdated, 0);
    assert.equal(store.writes.length, writesAfterFirst);
  }),
);

test(
  'recomputeAuditLogReadGrants reports a failed row with 502 and a retry finishes it',
  withAuditEnv(async () => {
    let failing = true;
    const store = preAmendmentAuditStore();
    const failStore = inMemoryStore(store.tables, {
      failUpdate: ({ rowId }) => failing && rowId === 'a000',
    });

    const failed = await recompute(failStore);
    failing = false;
    const retried = await recompute(failStore);

    assert.equal(failed.status, 502);
    assert.equal(failed.body.failureCount, 1);
    assert.equal(failed.body.failures[0].rowId, 'a000');
    assert.equal(retried.status, 200);
    assert.equal(retried.body.rowsUpdated, 1);
  }),
);

for (const [label, caller] of [
  ['an Organizer', { $id: 'org-1', labels: [] }],
  ['an Operator', { $id: 'op-1', labels: ['operator'] }],
]) {
  test(
    `recomputeAuditLogReadGrants is Admin-only: ${label} gets 403 and nothing is written`,
    withAuditEnv(async () => {
      const store = preAmendmentAuditStore();

      const result = await recompute(store, caller);

      assert.equal(result.status, 403);
      assert.equal(store.writes.length, 0);
    }),
  );
}
