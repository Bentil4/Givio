import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminUsersRequest } from '../src/admin-users.js';
import { fakeContext, ADMIN_HEADERS, asAdmin } from './helpers/admin-users-fixtures.js';

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
    {
      id: 'u1',
      name: 'Ama',
      email: 'ama@givio.test',
      role: 'operator',
      superAdmin: false,
      active: true,
      registeredAt: '2026-01-01',
    },
    {
      id: 'u2',
      name: 'Kofi',
      email: 'kofi@givio.test',
      role: null,
      superAdmin: false,
      active: false,
      registeredAt: '2026-02-01',
    },
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
    {
      $id: 'u100',
      name: 'Last',
      email: 'last@givio.test',
      labels: [],
      status: true,
      registration: '2026-01-01',
    },
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
    body: { action: 'createUser', name: 'New User', email: 'new@givio.test', role: 'operator' },
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
    body: {
      action: 'createUser',
      name: 'New User',
      email: 'new@givio.test',
      role: 'operator',
      password: '',
    },
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
    body: { action: 'createUser', name: 'Dup', email: 'dup@givio.test', role: 'operator' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      create: () => {
        const err = new Error(
          'A user with the same id, email, or phone already exists in this project.',
        );
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
      role: 'operator',
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
      role: 'operator',
      phone: '+233548244583',
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      create: () => {
        const err = new Error(
          'A user with the same id, email, or phone already exists in this project.',
        );
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
      role: 'operator',
      phone: '+233548244583',
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      create: () => {
        const err = new Error(
          'A user with the same id, email, or phone already exists in this project.',
        );
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
    body: {
      action: 'createUser',
      name: 'X',
      email: 'x@givio.test',
      role: 'operator',
      phone: 'not-a-phone',
    },
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
