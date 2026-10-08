import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAdminCaller, verifyCaller } from '../src/shared.js';
import { fakeContext, ADMIN_HEADERS } from './helpers/admin-users-fixtures.js';
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
}

function verifyWith(verify, account) {
  class AccountCtor {
    async get() {
      return account;
    }
  }
  return verify({
    req: { headers: { 'x-appwrite-user-jwt': 'jwt' } },
    ClientCtor: FakeClient,
    AccountCtor,
    endpoint: 'https://example.test',
    projectId: 'p',
    error: () => {},
  });
}

const BLOCKED_ACCOUNTS = {
  admin: { $id: 'a', labels: ['admin'], status: false },
  organizer: { $id: 'o', labels: [], status: false },
  operator: { $id: 'op', labels: ['operator'], status: false },
};

for (const [tier, account] of Object.entries(BLOCKED_ACCOUNTS)) {
  test(`verifyCaller rejects a blocked ${tier} with 403`, async () => {
    const { errorResponse, caller } = await verifyWith(verifyCaller, account);

    assert.equal(errorResponse.status, 403);
    assert.equal(caller, undefined);
  });
}

test('verifyAdminCaller rejects a blocked admin with 403', async () => {
  const { errorResponse } = await verifyWith(verifyAdminCaller, BLOCKED_ACCOUNTS.admin);

  assert.equal(errorResponse.status, 403);
});

test('verifyCaller still accepts an active account', async () => {
  const { caller } = await verifyWith(verifyCaller, { $id: 'o', labels: [], status: true });

  assert.equal(caller.$id, 'o');
});

test('a blocked admin gets 403 from the admin-users handler before any user is listed', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'listUsers' },
    headers: ADMIN_HEADERS,
    getAccount: async () => BLOCKED_ACCOUNTS.admin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 403);
  assert.equal(calls.list, undefined);
});
