import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminUsersRequest } from '../src/admin-users.js';
import {
  fakeContext,
  ADMIN_HEADERS,
  asAdmin,
  asSuperAdmin,
  defaultUsersGet,
} from './helpers/admin-users-fixtures.js';

test('updateUser only calls the update methods for fields actually provided', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', name: 'Renamed' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateName[0][0], { userId: 'u1', name: 'Renamed' });
  assert.equal(calls.updateEmail, undefined);
  assert.equal(calls.updateLabels, undefined);
});

test('updateUser marks a genuinely changed email as unverified', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', email: 'new-address@givio.test' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: { get: defaultUsersGet },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateEmail[0][0], { userId: 'u1', email: 'new-address@givio.test' });
  assert.deepEqual(calls.updateEmailVerification[0][0], { userId: 'u1', emailVerification: false });
});

test('updateUser skips the email update entirely when the submitted email matches the current one', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', name: 'Renamed Only', email: 'same@givio.test' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: { get: () => ({ email: 'same@givio.test' }) },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateName[0][0], { userId: 'u1', name: 'Renamed Only' });
  assert.equal(calls.updateEmail, undefined);
  assert.equal(calls.updateEmailVerification, undefined);
});

test('updateUser can also change the role, reusing the same updateLabels call', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', role: 'admin' },
    headers: ADMIN_HEADERS,
    getAccount: asSuperAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateLabels[0][0], { userId: 'u1', labels: ['admin'] });
});

test('updateUser reports appliedFields on success too, not just on failure', async () => {
  const { ctx } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', name: 'Renamed', role: 'admin' },
    headers: ADMIN_HEADERS,
    getAccount: asSuperAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.appliedFields, ['name', 'role']);
});

test('updateUser with no fields provided returns an empty appliedFields rather than omitting it', async () => {
  const { ctx } = fakeContext({
    body: { action: 'updateUser', userId: 'u1' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.appliedFields, []);
});

test('updateUser rejects a duplicate email the same way createUser does, reporting which fields still applied', async () => {
  const { ctx } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', name: 'Still Renamed', email: 'taken@givio.test' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      get: defaultUsersGet,
      updateEmail: () => {
        const err = new Error('duplicate');
        err.code = 409;
        err.type = 'user_already_exists';
        throw err;
      },
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 409);
  assert.deepEqual(result.body.appliedFields, ['name']);
});

test('updateUser reports exactly which fields succeeded when one fails partway through', async () => {
  const { ctx } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', name: 'Renamed', role: 'admin' },
    headers: ADMIN_HEADERS,
    getAccount: asSuperAdmin,
    users: {
      updateLabels: () => {
        throw new Error('transient failure');
      },
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 502);
  assert.deepEqual(result.body.appliedFields, ['name']);
});

test('updateUser rejects an admin trying to change their own role', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'updateUser', userId: 'admin-1', role: 'operator' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 400);
  assert.equal(calls.updateLabels, undefined);
});

test('updateUser still allows an admin to change their own name', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'updateUser', userId: 'admin-1', name: 'New Name' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateName[0][0], { userId: 'admin-1', name: 'New Name' });
});

test('setStatus(false) deactivates a user', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'setStatus', userId: 'u4', active: false },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateStatus[0][0], { userId: 'u4', status: false });
});

test('setStatus(true) reactivates a user', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'setStatus', userId: 'u4', active: true },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateStatus[0][0], { userId: 'u4', status: true });
});

test('setStatus rejects an admin trying to deactivate their own account', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'setStatus', userId: 'admin-1', active: false },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 400);
  assert.equal(calls.updateStatus, undefined);
});

test('returns a structured 502, not a throw, when a Users service call fails', async () => {
  const { ctx } = fakeContext({
    body: { action: 'setStatus', userId: 'does-not-exist', active: false },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      updateStatus: () => {
        throw new Error('user_not_found');
      },
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 502);
});

test('rejects a verified non-admin caller with 403 for forceExpireSessions', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'forceExpireSessions', userId: 'u4' },
    headers: { 'x-appwrite-user-jwt': 'operator-jwt' },
    getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 403);
  assert.equal(calls.deleteSessions, undefined);
});

test('forceExpireSessions rejects an admin trying to force-expire their own sessions', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'forceExpireSessions', userId: 'admin-1' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 400);
  assert.equal(calls.deleteSessions, undefined);
});

test('forceExpireSessions calls deleteSessions with the target userId', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'forceExpireSessions', userId: 'u4' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, userId: 'u4' });
  assert.deepEqual(calls.deleteSessions[0][0], { userId: 'u4' });
});

test('forceExpireSessions returns a structured 502, not a throw, when deleteSessions fails', async () => {
  const { ctx } = fakeContext({
    body: { action: 'forceExpireSessions', userId: 'u4' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      deleteSessions: () => {
        throw new Error('user_not_found');
      },
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 502);
});
