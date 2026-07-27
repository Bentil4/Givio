import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setRole } from '../src/role-writer.js';

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

function fakeContext({ body, headers = {}, getAccount, updateLabels }) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }

  class UsersCtor {
    async updateLabels(args) {
      return updateLabels ? updateLabels(args) : undefined;
    }
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
  };
}

test('rejects a malformed role with 400', async () => {
  const { ctx, jsonCalls } = fakeContext({
    body: { userId: 'user-1', role: 'superadmin' },
    headers: { 'x-appwrite-user-jwt': 'jwt' },
    getAccount: async () => ({ $id: 'user-1', labels: ['admin'] }),
  });

  const result = await setRole(ctx);

  assert.equal(result.status, 400);
  assert.equal(jsonCalls.length, 1);
});

test('rejects a request with no JWT with 401', async () => {
  const { ctx } = fakeContext({
    body: { userId: 'user-1', role: 'admin' },
    headers: {},
    getAccount: async () => {
      throw new Error('should not be called');
    },
  });

  const result = await setRole(ctx);

  assert.equal(result.status, 401);
});

test('rejects a caller whose JWT fails verification with 401', async () => {
  const { ctx } = fakeContext({
    body: { userId: 'user-1', role: 'admin' },
    headers: { 'x-appwrite-user-jwt': 'expired-jwt' },
    getAccount: async () => {
      throw new Error('JWT expired');
    },
  });

  const result = await setRole(ctx);

  assert.equal(result.status, 401);
});

test('rejects a verified non-admin caller with 403 and never writes the label', async () => {
  let updateLabelsCalled = false;
  const { ctx } = fakeContext({
    body: { userId: 'user-2', role: 'admin' },
    headers: { 'x-appwrite-user-jwt': 'operator-jwt' },
    getAccount: async () => ({ $id: 'caller-1', labels: ['operator'] }),
    updateLabels: () => {
      updateLabelsCalled = true;
    },
  });

  const result = await setRole(ctx);

  assert.equal(result.status, 403);
  assert.equal(updateLabelsCalled, false);
});

test('writes the label for a verified admin caller and returns success', async () => {
  let receivedArgs;
  const { ctx } = fakeContext({
    body: { userId: 'user-3', role: 'operator' },
    headers: { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'dynamic-key' },
    getAccount: async () => ({ $id: 'caller-9', labels: ['admin'] }),
    updateLabels: (args) => {
      receivedArgs = args;
    },
  });

  const result = await setRole(ctx);

  assert.deepEqual(receivedArgs, { userId: 'user-3', labels: ['operator'] });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { success: true, userId: 'user-3', role: 'operator' });
});

test('never trusts x-appwrite-user-id alone — only a successful JWT-verified account.get() authorizes', async () => {
  const { ctx } = fakeContext({
    body: { userId: 'user-4', role: 'admin' },
    headers: {
      'x-appwrite-user-jwt': 'jwt-for-non-admin',
      'x-appwrite-user-id': 'spoofed-admin-id',
    },
    getAccount: async () => ({ $id: 'real-caller', labels: ['operator'] }),
  });

  const result = await setRole(ctx);

  assert.equal(result.status, 403);
});

test('returns a structured error, not a throw, when updateLabels fails', async () => {
  const { ctx } = fakeContext({
    body: { userId: 'does-not-exist', role: 'admin' },
    headers: { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'dynamic-key' },
    getAccount: async () => ({ $id: 'caller-1', labels: ['admin'] }),
    updateLabels: () => {
      throw new Error('user_not_found');
    },
  });

  const result = await setRole(ctx);

  assert.equal(result.status, 502);
});

test('rejects an unauthenticated request with 401 even when the body is malformed — auth is checked before body shape', async () => {
  const { ctx } = fakeContext({
    body: { role: 'not-a-real-role' },
    headers: {},
    getAccount: async () => {
      throw new Error('should not be called');
    },
  });

  const result = await setRole(ctx);

  assert.equal(result.status, 401);
});

test('returns a distinct 500 (not a generic 502) when the dynamic x-appwrite-key is missing, and never calls updateLabels', async () => {
  let updateLabelsCalled = false;
  const { ctx } = fakeContext({
    body: { userId: 'user-5', role: 'operator' },
    headers: { 'x-appwrite-user-jwt': 'admin-jwt' },
    getAccount: async () => ({ $id: 'caller-1', labels: ['admin'] }),
    updateLabels: () => {
      updateLabelsCalled = true;
    },
  });

  const result = await setRole(ctx);

  assert.equal(result.status, 500);
  assert.equal(updateLabelsCalled, false);
});
