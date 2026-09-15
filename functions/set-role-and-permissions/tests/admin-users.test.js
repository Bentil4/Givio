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

function fakeContext({ body, headers = {}, getAccount, users = {}, messaging = {}, fetchImpl }) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];
  const calls = {};

  // async so a fake impl that throws synchronously still produces a rejected promise,
  // matching the real node-appwrite SDK's contract (its methods never throw synchronously).
  const record =
    (name, impls = users) =>
    async (...args) => {
      calls[name] = calls[name] ?? [];
      calls[name].push(args);
      const impl = impls[name];
      return impl ? impl(...args) : undefined;
    };

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }

  class UsersCtor {
    list = record('list');
    get = record('get');
    create = record('create');
    updateName = record('updateName');
    updateEmail = record('updateEmail');
    updateEmailVerification = record('updateEmailVerification');
    updateLabels = record('updateLabels');
    updateStatus = record('updateStatus');
    deleteSessions = record('deleteSessions');
  }

  class MessagingCtor {
    createEmail = record('createEmail', messaging);
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
      MessagingCtor,
      fetchImpl: fetchImpl ?? (async () => ({ ok: true, status: 200 })),
    },
    jsonCalls,
    logs,
    errors,
    calls,
  };
}

const ADMIN_HEADERS = { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'dynamic-key' };
const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });
// Default fake: users.get() returns a different email than any update payload, so the
// "did the email actually change" check passes through to a real update unless a test
// overrides `users.get` to simulate "no change".
const defaultUsersGet = () => ({ email: 'unchanged-elsewhere@givio.test' });

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

test('a malformed payload returns 400, not 500, even when the dynamic key is also missing', async () => {
  const { ctx } = fakeContext({
    body: { action: 'setStatus' },
    headers: { 'x-appwrite-user-jwt': 'admin-jwt' },
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 400);
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

test('listUsers pages through the full result set instead of silently truncating', async () => {
  const pageOf100 = Array.from({ length: 100 }, (_, i) => ({
    $id: `u${i}`,
    name: `User ${i}`,
    email: `u${i}@givio.test`,
    labels: [],
    status: true,
    registration: '2026-01-01',
  }));
  const secondPage = [
    { $id: 'u100', name: 'Last', email: 'last@givio.test', labels: [], status: true, registration: '2026-01-01' },
  ];
  let call = 0;

  const { ctx } = fakeContext({
    body: { action: 'listUsers' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      list: () => {
        call += 1;
        return { users: call === 1 ? pageOf100 : secondPage };
      },
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.equal(result.body.length, 101);
  assert.equal(call, 2);
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

test('createUser treats an empty-string password the same as omitting one', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'createUser', name: 'New User', email: 'new@givio.test', role: 'admin', password: '' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      create: () => ({ $id: 'new-3' }),
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.notEqual(calls.create[0][0].password, '');
  assert.ok(result.body.generatedPassword.length > 0);
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

test('createUser attributes a phone conflict to the phone number, not the email', async () => {
  const { ctx } = fakeContext({
    body: {
      action: 'createUser',
      name: 'Dup',
      email: 'fresh@givio.test',
      role: 'admin',
      phone: '+233548244583',
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      create: () => {
        const err = new Error('A user with the same phone already exists in this project.');
        err.code = 409;
        err.type = 'user_phone_already_exists';
        throw err;
      },
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 409);
  assert.match(result.body.error, /phone number already exists/i);
});

test('createUser resolves a generic conflict to phone when email search finds no match', async () => {
  const { ctx } = fakeContext({
    body: {
      action: 'createUser',
      name: 'Dup',
      email: 'fresh@givio.test',
      role: 'admin',
      phone: '+233548244583',
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      create: () => {
        const err = new Error('A user with the same id, email, or phone already exists in this project.');
        err.code = 409;
        err.type = 'user_already_exists';
        throw err;
      },
      list: () => ({ total: 0, users: [] }),
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 409);
  assert.match(result.body.error, /phone number already exists/i);
});

test('createUser resolves a generic conflict to email when the email search finds a match', async () => {
  const { ctx } = fakeContext({
    body: {
      action: 'createUser',
      name: 'Dup',
      email: 'taken@givio.test',
      role: 'admin',
      phone: '+233548244583',
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      create: () => {
        const err = new Error('A user with the same id, email, or phone already exists in this project.');
        err.code = 409;
        err.type = 'user_already_exists';
        throw err;
      },
      list: () => ({ total: 1, users: [{ $id: 'existing-1' }] }),
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 409);
  assert.match(result.body.error, /email already exists/i);
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

test('createUser rejects sms invite without a phone number, before calling users.create', async () => {
  const { ctx, calls } = fakeContext({
    body: {
      action: 'createUser',
      name: 'X',
      email: 'x@givio.test',
      role: 'operator',
      inviteChannels: ['sms'],
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 400);
  assert.equal(calls.create, undefined);
});

test('createUser rejects a malformed phone number', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'createUser', name: 'X', email: 'x@givio.test', role: 'operator', phone: 'not-a-phone' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 400);
  assert.equal(calls.create, undefined);
});

test('createUser sends an email and sms invite and reports both as sent', async () => {
  const { ctx, calls } = fakeContext({
    body: {
      action: 'createUser',
      name: 'New User',
      email: 'new@givio.test',
      role: 'operator',
      phone: '+233241234567',
      inviteChannels: ['email', 'sms'],
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: { create: () => ({ $id: 'invited-1' }) },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.inviteStatus, { email: 'sent', sms: 'sent' });
  assert.equal(typeof result.body.generatedPassword, 'string');
  assert.equal(calls.create[0][0].phone, '+233241234567');
  assert.deepEqual(calls.createEmail[0][0].users, ['invited-1']);
  assert.equal(calls.createEmail[0][0].html, true);
  assert.match(calls.createEmail[0][0].subject, /operator/i);
  assert.match(calls.createEmail[0][0].content, /New User/);
  assert.match(calls.createEmail[0][0].content, /new@givio\.test/);
  assert.match(calls.createEmail[0][0].content, new RegExp(result.body.generatedPassword));
});

test('createUser still creates the user and returns the password when the email invite provider throws', async () => {
  const { ctx } = fakeContext({
    body: {
      action: 'createUser',
      name: 'New User',
      email: 'new@givio.test',
      role: 'operator',
      inviteChannels: ['email'],
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: { create: () => ({ $id: 'invited-2' }) },
    messaging: {
      createEmail: () => {
        throw new Error('no email provider configured');
      },
    },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(typeof result.body.generatedPassword, 'string');
  assert.deepEqual(result.body.inviteStatus, { email: 'failed' });
});

test('createUser reports an sms invite as failed when Arkesel returns a non-2xx status', async () => {
  const { ctx } = fakeContext({
    body: {
      action: 'createUser',
      name: 'New User',
      email: 'new@givio.test',
      role: 'operator',
      phone: '+233241234567',
      inviteChannels: ['sms'],
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: { create: () => ({ $id: 'invited-3' }) },
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.inviteStatus, { sms: 'failed' });
});

test('createUser with no inviteChannels behaves exactly as before — no inviteStatus at all', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'createUser', name: 'New User', email: 'new@givio.test', role: 'operator' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: { create: () => ({ $id: 'invited-4' }) },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.equal(result.body.inviteStatus, undefined);
  assert.equal(calls.createEmail, undefined);
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
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.deepEqual(calls.updateLabels[0][0], { userId: 'u1', labels: ['admin'] });
});

test('updateUser reports appliedFields on success too, not just on failure', async () => {
  const { ctx } = fakeContext({
    body: { action: 'updateUser', userId: 'u1', name: 'Renamed', role: 'admin' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
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
    getAccount: asAdmin,
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
