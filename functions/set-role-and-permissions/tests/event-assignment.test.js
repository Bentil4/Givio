import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleEventAssignmentRequest } from '../src/event-assignment.js';

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

function fakeContext({ body, headers = {}, getAccount, users = {}, databases = {} }) {
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

  class UsersCtor {
    get = record('get', users);
  }

  class DatabasesCtor {
    getRow = record('getRow', databases);
    updateRow = record('updateRow', databases);
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
      UsersCtor,
      DatabasesCtor,
    },
    jsonCalls,
    logs,
    errors,
    calls,
  };
}

const ADMIN_HEADERS = { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'dynamic-key' };
const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });
const asOperatorAccount = (userId) => ({ $id: userId, labels: ['operator'] });

function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_EVENTS_COLLECTION_ID = 'events-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
    }
  };
}

test(
  'rejects a verified non-admin caller with 403',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'assignOperators', eventId: 'e1', assignedUserIds: [] },
      headers: { 'x-appwrite-user-jwt': 'operator-jwt' },
      getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 403);
    assert.equal(calls.getRow, undefined);
  }),
);

test(
  'rejects an unknown action with 400',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'notARealAction' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 400);
  }),
);

test(
  'rejects a missing eventId with 400 before touching Databases',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'assignOperators', assignedUserIds: [] },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 400);
    assert.equal(calls.getRow, undefined);
  }),
);

test(
  'rejects a non-array assignedUserIds with 400',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'assignOperators', eventId: 'e1', assignedUserIds: 'op-1' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 400);
  }),
);

test(
  'returns a distinct 500 when the dynamic x-appwrite-key is missing',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'assignOperators', eventId: 'e1', assignedUserIds: [] },
      headers: { 'x-appwrite-user-jwt': 'admin-jwt' },
      getAccount: asAdmin,
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 500);
  }),
);

test('returns a distinct 500 when APPWRITE_DATABASE_ID/APPWRITE_EVENTS_COLLECTION_ID are not configured', async () => {
  delete process.env.APPWRITE_DATABASE_ID;
  delete process.env.APPWRITE_EVENTS_COLLECTION_ID;

  const { ctx } = fakeContext({
    body: { action: 'assignOperators', eventId: 'e1', assignedUserIds: [] },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleEventAssignmentRequest(ctx);

  assert.equal(result.status, 500);
});

test(
  'rejects an assignedUserIds entry that does not exist',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'assignOperators', eventId: 'e1', assignedUserIds: ['ghost'] },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: {
        get: async () => {
          throw new Error('user_not_found');
        },
      },
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 400);
    assert.match(result.body.error, /ghost/);
    assert.equal(calls.getRow, undefined);
  }),
);

test(
  'rejects an assignedUserIds entry that exists but is not an Operator',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'assignOperators', eventId: 'e1', assignedUserIds: ['admin-2'] },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: { get: async () => ({ $id: 'admin-2', labels: ['admin'] }) },
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 400);
    assert.match(result.body.error, /not an Operator/);
    assert.equal(calls.getRow, undefined);
  }),
);

test(
  'returns 404 when the event does not exist',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'assignOperators', eventId: 'missing-event', assignedUserIds: ['op-1'] },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: { get: async (args) => asOperatorAccount(args.userId) },
      databases: {
        getRow: async () => {
          throw new Error('row_not_found');
        },
      },
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 404);
  }),
);

test(
  'on success, writes assignedUserIds and admin+per-operator read permissions in one updateRow call',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'assignOperators', eventId: 'e1', assignedUserIds: ['op-1', 'op-2'] },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: { get: async (args) => asOperatorAccount(args.userId) },
      databases: {
        getRow: async () => ({ $id: 'e1' }),
        updateRow: async () => ({ $id: 'e1' }),
      },
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { success: true, eventId: 'e1', assignedUserIds: ['op-1', 'op-2'] });

    assert.equal(calls.updateRow.length, 1);
    const [update] = calls.updateRow[0];
    assert.equal(update.databaseId, 'db-1');
    assert.equal(update.tableId, 'events-1');
    assert.equal(update.rowId, 'e1');
    assert.deepEqual(update.data, { assignedUserIds: ['op-1', 'op-2'] });
    assert.equal(update.permissions.length, 5); // 3 admin + 2 operator
  }),
);

test(
  'assigning an empty array is allowed — it un-assigns every operator',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'assignOperators', eventId: 'e1', assignedUserIds: [] },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 'e1' }),
        updateRow: async () => ({ $id: 'e1' }),
      },
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 200);
    const [update] = calls.updateRow[0];
    assert.equal(update.permissions.length, 3); // admin CRUD only
  }),
);

test(
  'returns a structured 502, not a throw, when updateRow fails',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'assignOperators', eventId: 'e1', assignedUserIds: [] },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 'e1' }),
        updateRow: async () => {
          throw new Error('boom');
        },
      },
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 502);
  }),
);
