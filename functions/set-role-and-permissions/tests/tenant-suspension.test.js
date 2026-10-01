import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_ONLY,
  run,
  seedStore,
  setStatus,
  signedOutUserIds,
  suspend,
  withEnv,
} from './helpers/tenant-suspension-fixtures.js';

// Story 8.1 (FR-19): suspending a tenant cuts every member off in the same operation — Event/
// Donation grants and live sessions — and is only ever reported as done once both are confirmed.

const TENANT_A_MEMBERS = ['gone-a', 'op-a', 'org-a', 'so-a'];

function reinstatableStore() {
  const store = seedStore();
  Object.assign(store['tenants-1']['tenant-a'], {
    name: 'Asante Events',
    location: 'Kumasi',
    size: '11-50',
    type: 'funeral',
    estimatedUserCount: 12,
    verificationDocumentId: 'file-1',
    verifiedBy: 'admin-1',
    verifiedAt: '2026-09-01T00:00:00.000Z',
  });
  return store;
}

test(
  'suspendTenant suspends an approved tenant, sweeps its grants and signs every member out',
  withEnv(async () => {
    const { result, store, calls } = await run({ body: suspend() });

    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'suspended');
    assert.equal(result.body.membersSignedOut, TENANT_A_MEMBERS.length);
    assert.equal(store['tenants-1']['tenant-a'].status, 'suspended');
    assert.deepEqual(store['events-1']['event-a1'].$permissions, ADMIN_ONLY);
    assert.deepEqual(signedOutUserIds(calls), TENANT_A_MEMBERS);
  }),
);

test(
  'suspendTenant never touches another tenant or any Membership row',
  withEnv(async () => {
    const { store, calls } = await run({ body: suspend() });

    assert.equal(store['tenants-1']['tenant-b'].status, 'approved');
    assert.equal(signedOutUserIds(calls).includes('so-b'), false);
    const membershipWrites = calls.updateRow.filter((args) => args.tableId === 'memberships-1');
    assert.deepEqual(membershipWrites, []);
  }),
);

test(
  'suspendTenant reports 502 (never success) when signing a member out fails, and a retry heals it',
  withEnv(async () => {
    const store = seedStore();
    const failed = await run({
      body: suspend(),
      store,
      failOn: { deleteSessions: (args) => args.userId === 'op-a' },
    });

    assert.equal(failed.result.status, 502);
    assert.equal(failed.result.body.success, undefined);
    assert.equal(failed.result.body.sessions.ok, false);
    assert.deepEqual(
      failed.result.body.sessions.failures.map((f) => f.userId),
      ['op-a'],
    );
    assert.equal(store['tenants-1']['tenant-a'].status, 'suspended');

    const retried = await run({ body: suspend(), store });

    assert.equal(retried.result.status, 200);
    assert.deepEqual(signedOutUserIds(retried.calls), TENANT_A_MEMBERS);
  }),
);

test(
  'suspendTenant reports 502 when the grant sweep fails, still signing members out',
  withEnv(async () => {
    const { result, calls } = await run({
      body: suspend(),
      failOn: { updateRow: (args) => args.tableId === 'events-1' },
    });

    assert.equal(result.status, 502);
    assert.match(result.body.error, /sweeping its Event permissions failed/);
    assert.equal(result.body.grants.ok, false);
    assert.equal(result.body.sessions.ok, true);
    assert.deepEqual(signedOutUserIds(calls), TENANT_A_MEMBERS);
  }),
);

test(
  'suspendTenant reports 502 when the member list itself cannot be read for the sign-out',
  withEnv(async () => {
    const { result } = await run({
      body: suspend(),
      failOn: {
        listRows: (args) =>
          args.tableId === 'memberships-1' &&
          !args.queries.some((q) => JSON.parse(q).attribute === 'status'),
      },
    });

    assert.equal(result.status, 502);
    assert.equal(result.body.sessions.ok, false);
  }),
);

test(
  'suspendTenant counts a member whose Account no longer exists as signed out',
  withEnv(async () => {
    const { result } = await run({
      body: suspend(),
      failOn: { deleteSessions: (args) => args.userId === 'gone-a', deleteSessionsCode: 404 },
    });

    assert.equal(result.status, 200);
  }),
);

test(
  'suspendTenant refuses a pending tenant without signing anyone out',
  withEnv(async () => {
    const { result, calls } = await run({ body: suspend('tenant-p') });

    assert.equal(result.status, 400);
    assert.equal(calls.deleteSessions, undefined);
  }),
);

test(
  'suspendTenant returns 404 for an unknown tenant',
  withEnv(async () => {
    const { result, calls } = await run({ body: suspend('tenant-x') });

    assert.equal(result.status, 404);
    assert.equal(calls.deleteSessions, undefined);
  }),
);

test(
  'suspendTenant requires a tenantId',
  withEnv(async () => {
    const { result } = await run({ body: { action: 'suspendTenant' } });

    assert.equal(result.status, 400);
  }),
);

test(
  'reinstating a suspended tenant restores every Membership-derived grant without re-granting anyone',
  withEnv(async () => {
    const store = reinstatableStore();
    await run({ body: suspend(), store });

    const { result, calls } = await run({ body: setStatus('approved'), store });

    assert.equal(result.status, 200);
    assert.equal(store['tenants-1']['tenant-a'].status, 'approved');
    const grants = store['events-1']['event-a1'].$permissions;
    for (const uid of ['so-a', 'org-a', 'op-a']) {
      assert.ok(grants.includes(`read("user:${uid}")`), `${uid} regains read`);
    }
    assert.equal(grants.includes('read("user:gone-a")'), false);
    assert.deepEqual(
      calls.updateRow.filter((args) => args.tableId === 'memberships-1'),
      [],
    );
  }),
);

test(
  'a reinstatement whose sweep failed can be retried with the same call',
  withEnv(async () => {
    const store = reinstatableStore();
    await run({ body: suspend(), store });
    const failed = await run({
      body: setStatus('approved'),
      store,
      failOn: { updateRow: (args) => args.tableId === 'events-1' },
    });
    assert.equal(failed.result.status, 502);

    const retried = await run({ body: setStatus('approved'), store });

    assert.equal(retried.result.status, 200);
    assert.ok(store['events-1']['event-a1'].$permissions.includes('read("user:op-a")'));
  }),
);
