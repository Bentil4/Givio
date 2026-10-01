import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminUsersRequest } from '../src/admin-users.js';
import { fakeContext, ADMIN_HEADERS, asAdmin } from './helpers/admin-users-fixtures.js';

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
