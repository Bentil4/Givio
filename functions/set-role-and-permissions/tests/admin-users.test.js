import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminUsersRequest } from '../src/admin-users.js';

class FakeClient {
  setEndpoint() {
    return this;
  }
  setProject() {
    return this;
  }
  setJWT() {
    return this;
  }
  setKey() {
    return this;
  }
}

function fakeContext({ body, headers = {}, getAccount, users = {} }) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];
  const calls = {};

  const record =
    (name) =>
    (...args) => {
      calls[name] = calls[name] ?? [];
      calls[name].push(args);
      const impl = users[name];
      return impl ? impl(...args) : undefined;
    };

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }

  class UsersCtor {
    list = record('list');
    create = record('create');
    updateName = record('updateName');
    updateEmail = record('updateEmail');
    updateEmailVerification = record('updateEmailVerification');
    updateLabels = record('updateLabels');
    updateStatus = record('updateStatus');
  }

  const res = {
    json(body, status = 200) {
      const result = { body, status };
      jsonCalls.push(result);
      return result;
    },
  };

  const req = {
    bodyRaw: JSON.stringify(body),
    headers,
  };

  return {
    ctx: {
      req,
      res,
      log: (msg) => logs.push(msg),
      error: (msg) => errors.push(msg),
      ClientCtor: FakeClient,
      AccountCtor,
      UsersCtor,
    },
    jsonCalls,
    logs,
    errors,
    calls,
  };
}

const ADMIN_HEADERS = { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'dynamic-key' };
const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });

test('rejects an unauthenticated request with 401 even when the body is malformed', async () => {
  const { ctx } = fakeContext({
    body: { action: 'not-a-real-action' },
    headers: {},
    getAccount: async () => {
      throw new Error('should not be called');
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 401);
});

test('rejects a caller whose JWT fails verification with 401', async () => {
  const { ctx } = fakeContext({
    body: { action: 'listUsers' },
    headers: { 'x-appwrite-user-jwt': 'expired-jwt' },
    getAccount: async () => {
      throw new Error('expired');
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 401);
});

test('rejects a verified non-admin caller with 403 for listUsers', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'listUsers' },
    headers: { 'x-appwrite-user-jwt': 'operator-jwt' },
    getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 403);
  assert.equal(calls.list, undefined);
});

test('rejects a verified non-admin caller with 403 for createUser', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'createUser', name: 'X', email: 'x@givio.test', role: 'admin' },
    headers: { 'x-appwrite-user-jwt': 'operator-jwt' },
    getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 403);
  assert.equal(calls.create, undefined);
});

test('rejects an unknown action with 400 once the caller is verified', async () => {
  const { ctx } = fakeContext({
    body: { action: 'deleteEverything' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 400);
});

test('returns a distinct 500 when the dynamic x-appwrite-key is missing', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'listUsers' },
    headers: { 'x-appwrite-user-jwt': 'admin-jwt' },
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 500);
  assert.equal(calls.list, undefined);
});

test('listUsers maps the Users service result to the AdminUser shape', async () => {
  const { ctx } = fakeContext({
    body: { action: 'listUsers' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      list: () => ({
        users: [
          {
            $id: 'u1',
            name: 'Ama',
            email: 'ama@givio.test',
            labels: ['operator'],
            status: true,
            registration: '2026-01-01',
          },
          {
            $id: 'u2',
            name: 'Kofi',
            email: 'kofi@givio.test',
            labels: [],
            status: false,
            registration: '2026-02-01',
          },
        ],
      }),
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, [
    { id: 'u1', name: 'Ama', email: 'ama@givio.test', role: 'operator', active: true, registeredAt: '2026-01-01' },
    { id: 'u2', name: 'Kofi', email: 'kofi@givio.test', role: null, active: false, registeredAt: '2026-02-01' },
  ]);
});

test('createUser with an explicit password does not return a generatedPassword', async () => {
  const { ctx, calls } = fakeContext({
    body: {
      action: 'createUser',
      name: 'New User',
      email: 'new@givio.test',
      role: 'operator',
      password: 'Sup3rSecret!',
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      create: () => ({ $id: 'new-1' }),
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, userId: 'new-1' });
  assert.equal(calls.create[0][0].password, 'Sup3rSecret!');
  assert.deepEqual(calls.updateLabels[0][0], { userId: 'new-1', labels: ['operator'] });
});

test('createUser without a password auto-generates one and returns it once', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'createUser', name: 'New User', email: 'new@givio.test', role: 'admin' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      create: () => ({ $id: 'new-2' }),
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(typeof result.body.generatedPassword, 'string');
  assert.ok(result.body.generatedPassword.length > 0);
  assert.equal(calls.create[0][0].password, result.body.generatedPassword);
});

test('createUser rejects a duplicate email with 409 and never sets a label', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'createUser', name: 'Dup', email: 'dup@givio.test', role: 'admin' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      create: () => {
        const err = new Error('A user with the same id, email, or phone already exists in this project.');
        err.code = 409;
        err.type = 'user_already_exists';
        throw err;
      },
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 409);
  assert.match(result.body.error, /already exists/i);
  assert.equal(calls.updateLabels, undefined);
});

test('createUser rejects an invalid role with 400 before calling users.create', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'createUser', name: 'X', email: 'x@givio.test', role: 'superadmin' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 400);
  assert.equal(calls.create, undefined);
});

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

test('updateUser marks a changed email as unverified', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', email: 'new-address@givio.test' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateEmail[0][0], { userId: 'u1', email: 'new-address@givio.test' });
  assert.deepEqual(calls.updateEmailVerification[0][0], { userId: 'u1', emailVerification: false });
});

test('updateUser can also change the role, reusing the same updateLabels call', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', role: 'admin' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateLabels[0][0], { userId: 'u1', labels: ['admin'] });
});

test('updateUser rejects a duplicate email the same way createUser does', async () => {
  const { ctx } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', email: 'taken@givio.test' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
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
});

test('setRole keeps the original single-purpose behavior', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'setRole', userId: 'u3', role: 'operator' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, userId: 'u3', role: 'operator' });
  assert.deepEqual(calls.updateLabels[0][0], { userId: 'u3', labels: ['operator'] });
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

test('never trusts x-appwrite-user-id alone — only a successful JWT-verified account.get() authorizes', async () => {
  const { ctx } = fakeContext({
    body: { action: 'listUsers' },
    headers: {
      'x-appwrite-user-jwt': 'jwt-for-non-admin',
      'x-appwrite-user-id': 'spoofed-admin-id',
    },
    getAccount: async () => ({ $id: 'real-caller', labels: ['operator'] }),
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 403);
});
