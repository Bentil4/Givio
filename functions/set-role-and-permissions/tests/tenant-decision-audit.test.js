import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  run,
  seedStore,
  setStatus,
  suspend,
  withEnv,
} from './helpers/tenant-suspension-fixtures.js';

// An Admin's decision on a company (suspend, reinstate, reject) goes on the platform audit
// trail: readable by Admin, never stamped with the company's tenantId, so it stays out of the
// company's own Activity log.

const withAudit = (fn) =>
  withEnv(async () => {
    process.env.APPWRITE_AUDIT_LOGS_COLLECTION_ID = 'audit-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_AUDIT_LOGS_COLLECTION_ID;
    }
  });

const auditRows = (store) => Object.values(store['audit-1']);

function storeWithNamedTenant(status) {
  const store = seedStore();
  Object.assign(store['tenants-1']['tenant-a'], {
    name: 'Asante Events',
    location: 'Kumasi',
    size: '11-50',
    type: 'funeral',
    estimatedUserCount: 12,
    verificationDocumentId: 'file-1',
    verifiedBy: 'admin-1',
    verifiedAt: '2026-09-01T09:00:00.000Z',
    status,
  });
  return store;
}

test(
  'suspending a company records who decided, from which status, and the company name',
  withAudit(async () => {
    const { result, store } = await run({
      body: suspend(),
      as: 'admin-1',
      store: storeWithNamedTenant('approved'),
    });

    assert.equal(result.status, 200);
    const [entry] = auditRows(store);
    assert.equal(entry.entityType, 'tenant');
    assert.equal(entry.entityId, 'tenant-a');
    assert.equal(entry.action, 'edit');
    assert.equal(entry.performedBy, 'admin-1');
    assert.deepEqual(JSON.parse(entry.previousValues), { status: 'approved' });
    assert.deepEqual(JSON.parse(entry.newValues), {
      decision: 'suspended',
      status: 'suspended',
      tenantName: 'Asante Events',
    });
  }),
);

test(
  "an Admin's decision is a platform entry: Admin can read it and it has no tenantId",
  withAudit(async () => {
    const { store } = await run({
      body: suspend(),
      as: 'admin-1',
      store: storeWithNamedTenant('approved'),
    });

    const [entry] = auditRows(store);
    assert.equal('tenantId' in entry, false);
    assert.deepEqual(entry.$permissions, ['read("label:admin")']);
  }),
);

test(
  'reinstating a suspended company is told apart from approving a new one',
  withAudit(async () => {
    const { result, store } = await run({
      body: setStatus('approved'),
      as: 'admin-1',
      store: storeWithNamedTenant('suspended'),
    });

    assert.equal(result.status, 200);
    const [entry] = auditRows(store);
    assert.equal(JSON.parse(entry.newValues).decision, 'reinstated');
    assert.deepEqual(JSON.parse(entry.previousValues), { status: 'suspended' });
  }),
);

test(
  'rejecting an application is recorded',
  withAudit(async () => {
    const { result, store } = await run({
      body: setStatus('rejected', 'tenant-p'),
      as: 'admin-1',
    });

    assert.equal(result.status, 200);
    const [entry] = auditRows(store);
    assert.equal(entry.entityId, 'tenant-p');
    assert.equal(JSON.parse(entry.newValues).decision, 'rejected');
  }),
);

test(
  'a refused change writes nothing: not an Admin, or a transition that is not allowed',
  withAudit(async () => {
    const operator = await run({ body: suspend(), as: 'op-a' });
    const illegal = await run({
      body: setStatus('suspended', 'tenant-p'),
      as: 'admin-1',
    });

    assert.equal(operator.result.status, 403);
    assert.equal(illegal.result.status, 400);
    assert.equal(auditRows(operator.store).length, 0);
    assert.equal(auditRows(illegal.store).length, 0);
  }),
);

test(
  'retrying a sweep with the same status does not record the decision twice',
  withAudit(async () => {
    const { store } = await run({
      body: setStatus('suspended'),
      as: 'admin-1',
      store: storeWithNamedTenant('suspended'),
    });

    assert.equal(auditRows(store).length, 0);
  }),
);

test(
  'a failed audit write never undoes or fails the decision',
  withAudit(async () => {
    const { result, store, errors } = await run({
      body: suspend(),
      as: 'admin-1',
      store: storeWithNamedTenant('approved'),
      failOn: { createRow: true },
    });

    assert.equal(result.status, 200);
    assert.equal(store['tenants-1']['tenant-a'].status, 'suspended');
    assert.ok(errors.some((message) => message.includes('writeTenantAuditLog')));
  }),
);
