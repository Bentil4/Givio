import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asAdmin,
  asSuperAdmin,
  adminTarget,
  operatorTarget,
  superAdminTarget,
  run,
} from './helpers/admin-users-fixtures.js';

// --- Story 8.6 / FR-26 / AD-11: Super Admin manages Admin accounts ---

test('FR-25: a Super Admin passes the ordinary admin gate — listUsers works unchanged', async () => {
  const { result } = await run({
    body: { action: 'listUsers' },
    getAccount: asSuperAdmin,
    users: { list: () => ({ users: [] }) },
  });

  assert.equal(result.status, 200);
});

test('listUsers flags the superadmin holder so the client can render the tier badge', async () => {
  const { result } = await run({
    body: { action: 'listUsers' },
    getAccount: asSuperAdmin,
    users: {
      list: () => ({
        users: [
          {
            $id: 's',
            name: 'N',
            email: 'n@g.test',
            labels: ['admin', 'superadmin'],
            status: true,
          },
        ],
      }),
    },
  });

  assert.equal(result.body[0].role, 'admin');
  assert.equal(result.body[0].superAdmin, true);
});

test('FR-26: Super Admin can create an Admin account', async () => {
  const { result, calls } = await run({
    body: { action: 'createUser', name: 'New Admin', email: 'na@givio.test', role: 'admin' },
    getAccount: asSuperAdmin,
    users: { create: () => ({ $id: 'new-admin' }) },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateLabels[0][0], { userId: 'new-admin', labels: ['admin'] });
});

test('FR-26: an ordinary Admin cannot create an Admin account — 403 before users.create', async () => {
  const { result, calls, errors } = await run({
    body: { action: 'createUser', name: 'Sneaky', email: 's@givio.test', role: 'admin' },
    getAccount: asAdmin,
  });

  assert.equal(result.status, 403);
  assert.equal(calls.create, undefined);
  assert.ok(errors.some((e) => e.includes('FR-26 rejected')));
});

test('an ordinary Admin can still create an Operator (Story 1.3 unchanged)', async () => {
  const { result } = await run({
    body: { action: 'createUser', name: 'Op', email: 'op@givio.test', role: 'operator' },
    getAccount: asAdmin,
    users: { create: () => ({ $id: 'new-op' }) },
  });

  assert.equal(result.status, 200);
});

test('superadmin can never be granted through createUser', async () => {
  const { result, calls } = await run({
    body: { action: 'createUser', name: 'X', email: 'x@givio.test', role: 'superadmin' },
    getAccount: asSuperAdmin,
  });

  assert.equal(result.status, 400);
  assert.equal(calls.create, undefined);
});

test('superadmin can never be granted through updateUser', async () => {
  const { result, calls } = await run({
    body: { action: 'updateUser', userId: 'admin-2', role: 'superadmin' },
    getAccount: asSuperAdmin,
    users: { get: adminTarget },
  });

  assert.equal(result.status, 400);
  assert.equal(calls.updateLabels, undefined);
});

test('FR-26: Super Admin can promote an Operator to Admin', async () => {
  const { result, calls } = await run({
    body: { action: 'updateUser', userId: 'op-9', role: 'admin' },
    getAccount: asSuperAdmin,
    users: { get: operatorTarget },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateLabels[0][0], { userId: 'op-9', labels: ['admin'] });
});

test('FR-26: an ordinary Admin cannot promote an Operator to Admin (pre-existing hole closed)', async () => {
  const { result, calls } = await run({
    body: { action: 'updateUser', userId: 'op-9', role: 'admin' },
    getAccount: asAdmin,
    users: { get: operatorTarget },
  });

  assert.equal(result.status, 403);
  assert.equal(calls.updateLabels, undefined);
});

test('FR-26: Super Admin can demote an Admin to Operator', async () => {
  const { result, calls } = await run({
    body: { action: 'updateUser', userId: 'admin-2', role: 'operator' },
    getAccount: asSuperAdmin,
    users: { get: adminTarget },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateLabels[0][0], { userId: 'admin-2', labels: ['operator'] });
});

test('FR-26: an ordinary Admin cannot demote another Admin', async () => {
  const { result, calls } = await run({
    body: { action: 'updateUser', userId: 'admin-2', role: 'operator' },
    getAccount: asAdmin,
    users: { get: adminTarget },
  });

  assert.equal(result.status, 403);
  assert.equal(calls.updateLabels, undefined);
});

test('an ordinary Admin cannot edit another Admin’s name or email either (account-takeover path)', async () => {
  const { result, calls } = await run({
    body: { action: 'updateUser', userId: 'admin-2', email: 'attacker@evil.test' },
    getAccount: asAdmin,
    users: { get: adminTarget },
  });

  assert.equal(result.status, 403);
  assert.equal(calls.updateEmail, undefined);
  assert.equal(calls.updateName, undefined);
});

test('an ordinary Admin can still edit and change the role of an Operator', async () => {
  const { result } = await run({
    body: { action: 'updateUser', userId: 'op-9', name: 'Renamed', role: 'operator' },
    getAccount: asAdmin,
    users: { get: operatorTarget },
  });

  assert.equal(result.status, 200);
});

test('FR-26: Super Admin suspends an Admin — status false and every session revoked in one call', async () => {
  const { result, calls } = await run({
    body: { action: 'setStatus', userId: 'admin-2', active: false },
    getAccount: asSuperAdmin,
    users: { get: adminTarget },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateStatus[0][0], { userId: 'admin-2', status: false });
  assert.deepEqual(calls.deleteSessions[0][0], { userId: 'admin-2' });
});

test('FR-26: suspension never deletes the account, so its audit attribution is retained', async () => {
  const { calls } = await run({
    body: { action: 'setStatus', userId: 'admin-2', active: false },
    getAccount: asSuperAdmin,
    users: { get: adminTarget },
  });

  assert.equal(calls.delete, undefined);
  assert.equal(calls.updateLabels, undefined);
});

test('FR-26: a suspension whose session revocation fails reports 502, not a false success', async () => {
  const { result } = await run({
    body: { action: 'setStatus', userId: 'admin-2', active: false },
    getAccount: asSuperAdmin,
    users: {
      get: adminTarget,
      deleteSessions: () => {
        throw new Error('transient');
      },
    },
  });

  assert.equal(result.status, 502);
  assert.equal(result.body.active, false);
});

test('Super Admin can reinstate a suspended Admin without touching sessions', async () => {
  const { result, calls } = await run({
    body: { action: 'setStatus', userId: 'admin-2', active: true },
    getAccount: asSuperAdmin,
    users: { get: adminTarget },
  });

  assert.equal(result.status, 200);
  assert.equal(calls.deleteSessions, undefined);
});

test('FR-26: an ordinary Admin cannot suspend another Admin', async () => {
  const { result, calls } = await run({
    body: { action: 'setStatus', userId: 'admin-2', active: false },
    getAccount: asAdmin,
    users: { get: adminTarget },
  });

  assert.equal(result.status, 403);
  assert.equal(calls.updateStatus, undefined);
});

test('FR-26: an ordinary Admin cannot reinstate a suspended Admin', async () => {
  const { result, calls } = await run({
    body: { action: 'setStatus', userId: 'admin-2', active: true },
    getAccount: asAdmin,
    users: { get: adminTarget },
  });

  assert.equal(result.status, 403);
  assert.equal(calls.updateStatus, undefined);
});

test('an ordinary Admin deactivating an Operator also revokes every session in the same call', async () => {
  const { result, calls } = await run({
    body: { action: 'setStatus', userId: 'op-9', active: false },
    getAccount: asAdmin,
    users: { get: operatorTarget },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateStatus[0][0], { userId: 'op-9', status: false });
  assert.deepEqual(calls.deleteSessions[0][0], { userId: 'op-9' });
});

test('an Operator deactivation whose session revocation fails reports 502, not a false success', async () => {
  const { result } = await run({
    body: { action: 'setStatus', userId: 'op-9', active: false },
    getAccount: asAdmin,
    users: {
      get: operatorTarget,
      deleteSessions: () => {
        throw new Error('transient');
      },
    },
  });

  assert.equal(result.status, 502);
  assert.equal(result.body.active, false);
  assert.equal(result.body.success, undefined);
});

test('reactivating an Operator never touches their sessions', async () => {
  const { result, calls } = await run({
    body: { action: 'setStatus', userId: 'op-9', active: true },
    getAccount: asAdmin,
    users: { get: operatorTarget },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateStatus[0][0], { userId: 'op-9', status: true });
  assert.equal(calls.deleteSessions, undefined);
});

test('sessions are not revoked when the status update itself fails', async () => {
  const { result, calls } = await run({
    body: { action: 'setStatus', userId: 'op-9', active: false },
    getAccount: asAdmin,
    users: {
      get: operatorTarget,
      updateStatus: () => {
        throw new Error('transient');
      },
    },
  });

  assert.equal(result.status, 502);
  assert.equal(calls.deleteSessions, undefined);
});

test('FR-26: an ordinary Admin cannot force-expire another Admin’s sessions', async () => {
  const { result, calls } = await run({
    body: { action: 'forceExpireSessions', userId: 'admin-2' },
    getAccount: asAdmin,
    users: { get: adminTarget },
  });

  assert.equal(result.status, 403);
  assert.equal(calls.deleteSessions, undefined);
});

test('Super Admin can force-expire an Admin’s sessions', async () => {
  const { result } = await run({
    body: { action: 'forceExpireSessions', userId: 'admin-2' },
    getAccount: asSuperAdmin,
    users: { get: adminTarget },
  });

  assert.equal(result.status, 200);
});

test('an ordinary Admin cannot act on the Super Admin account at all', async () => {
  for (const body of [
    { action: 'setStatus', userId: 'super-2', active: false },
    { action: 'updateUser', userId: 'super-2', role: 'operator' },
    { action: 'updateUser', userId: 'super-2', name: 'Hijacked' },
    { action: 'forceExpireSessions', userId: 'super-2' },
  ]) {
    const { result } = await run({ body, getAccount: asAdmin, users: { get: superAdminTarget } });
    assert.equal(result.status, 403, `${body.action} should be rejected`);
  }
});

test('the superadmin holder’s standing can’t be changed in-app, even by a Super Admin', async () => {
  const { result, calls } = await run({
    body: { action: 'updateUser', userId: 'super-2', role: 'operator' },
    getAccount: asSuperAdmin,
    users: { get: superAdminTarget },
  });

  assert.equal(result.status, 403);
  assert.equal(calls.updateLabels, undefined);
});

test('Super Admin cannot demote or suspend themself into a zero-Super-Admin state', async () => {
  for (const body of [
    { action: 'updateUser', userId: 'super-1', role: 'operator' },
    { action: 'setStatus', userId: 'super-1', active: false },
  ]) {
    const { result, calls } = await run({ body, getAccount: asSuperAdmin });
    assert.equal(result.status, 400);
    assert.equal(calls.updateLabels, undefined);
    assert.equal(calls.updateStatus, undefined);
  }
});

test('a suspended caller is rejected even if their JWT still verifies', async () => {
  const { result, calls } = await run({
    body: { action: 'listUsers' },
    getAccount: async () => ({ $id: 'super-1', labels: ['admin', 'superadmin'], status: false }),
  });

  assert.equal(result.status, 403);
  assert.equal(calls.list, undefined);
});

test('a missing target returns 404 without attempting the write', async () => {
  const { result, calls } = await run({
    body: { action: 'setStatus', userId: 'ghost', active: false },
    getAccount: asSuperAdmin,
    users: {
      get: () => {
        const err = new Error('not found');
        err.code = 404;
        throw err;
      },
    },
  });

  assert.equal(result.status, 404);
  assert.equal(calls.updateStatus, undefined);
});

test('a failed target lookup returns 502, never falls through to an unauthorized write', async () => {
  const { result, calls } = await run({
    body: { action: 'updateUser', userId: 'admin-2', role: 'operator' },
    getAccount: asAdmin,
    users: {
      get: () => {
        throw new Error('network');
      },
    },
  });

  assert.equal(result.status, 502);
  assert.equal(calls.updateLabels, undefined);
});
