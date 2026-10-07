import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleConflictResolutionRequest } from '../src/conflict-resolution.js';

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

function fakeContext({ body, headers = {}, getAccount, tablesDB = {} }) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];
  const calls = {};

  const record =
    (name, target) =>
    async (...args) => {
      calls[name] = calls[name] ?? [];
      calls[name].push(args);
      const impl = target[name];
      return impl ? impl(...args) : undefined;
    };

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }

  class TablesDBCtor {
    getRow = record('getRow', tablesDB);
    createRow = record('createRow', tablesDB);
    updateRow = record('updateRow', tablesDB);
  }

  const res = {
    json(responseBody, status = 200) {
      const result = { body: responseBody, status };
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
      TablesDBCtor,
    },
    jsonCalls,
    logs,
    errors,
    calls,
  };
}

const ADMIN_HEADERS = { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'dynamic-key' };
const OPERATOR_HEADERS = { 'x-appwrite-user-jwt': 'op-jwt', 'x-appwrite-key': 'dynamic-key' };
const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });
const asOperator = (id) => async () => ({ $id: id, labels: ['operator'] });

const LOCAL_DONATION = {
  id: 'd1',
  eventId: 'e1',
  receiptNumber: 'P-1',
  donorName: 'Ama (local)',
  amountMinor: 5000,
};
const SERVER_DONATION = {
  id: 'd1',
  eventId: 'e1',
  receiptNumber: 'P-1',
  donorName: 'Ama (server)',
  amountMinor: 6000,
};

function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_EVENTS_COLLECTION_ID = 'events-1';
    process.env.APPWRITE_DONATIONS_COLLECTION_ID = 'donations-1';
    process.env.APPWRITE_DONATION_CONFLICTS_COLLECTION_ID = 'conflicts-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
      delete process.env.APPWRITE_DONATIONS_COLLECTION_ID;
      delete process.env.APPWRITE_DONATION_CONFLICTS_COLLECTION_ID;
    }
  };
}

test(
  'rejects an unknown action with 400',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'notARealAction' },
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
    });

    const result = await handleConflictResolutionRequest(ctx);
    assert.equal(result.status, 400);
  }),
);

test('returns a distinct 500 when the function variables are not configured', async () => {
  const { ctx } = fakeContext({
    body: {
      action: 'recordConflict',
      receiptNumber: 'P-1',
      eventId: 'e1',
      localVersion: {},
      serverVersion: {},
    },
    headers: OPERATOR_HEADERS,
    getAccount: asOperator('op-1'),
  });

  const result = await handleConflictResolutionRequest(ctx);
  assert.equal(result.status, 500);
});

test(
  'recordConflict: rejects an unauthenticated request with 401',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: {
        action: 'recordConflict',
        receiptNumber: 'P-1',
        eventId: 'e1',
        localVersion: {},
        serverVersion: {},
      },
      headers: {},
      getAccount: asOperator('op-1'),
    });

    const result = await handleConflictResolutionRequest(ctx);
    assert.equal(result.status, 401);
  }),
);

test(
  'recordConflict: an Operator can file one, stored as JSON-stringified versions with no client permissions (AD-12 amended)',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: {
        action: 'recordConflict',
        receiptNumber: 'P-1',
        eventId: 'e1',
        localVersion: LOCAL_DONATION,
        serverVersion: SERVER_DONATION,
      },
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
      tablesDB: {
        createRow: async () => ({ $id: 'conflict-1' }),
      },
    });

    const result = await handleConflictResolutionRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.conflictId, 'conflict-1');
    const [createArgs] = calls.createRow[0];
    assert.equal(createArgs.data.localVersion, JSON.stringify(LOCAL_DONATION));
    assert.equal(createArgs.data.serverVersion, JSON.stringify(SERVER_DONATION));
    assert.deepEqual(createArgs.permissions, []);
  }),
);

test(
  "AD-12 amended: Admin's resolveConflict action is gone — an Admin gets 400 and no row is read",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'resolveConflict', conflictId: 'conflict-1', resolution: 'keep-server' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
    });

    const result = await handleConflictResolutionRequest(ctx);

    assert.equal(result.status, 400);
    assert.equal(calls.getRow, undefined);
  }),
);
