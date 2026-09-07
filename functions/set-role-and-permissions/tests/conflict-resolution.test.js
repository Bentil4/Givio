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

test(
  'returns a distinct 500 when the function variables are not configured',
  async () => {
    const { ctx } = fakeContext({
      body: { action: 'recordConflict', receiptNumber: 'P-1', eventId: 'e1', localVersion: {}, serverVersion: {} },
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
    });

    const result = await handleConflictResolutionRequest(ctx);
    assert.equal(result.status, 500);
  },
);

test(
  'recordConflict: rejects an unauthenticated request with 401',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'recordConflict', receiptNumber: 'P-1', eventId: 'e1', localVersion: {}, serverVersion: {} },
      headers: {},
      getAccount: asOperator('op-1'),
    });

    const result = await handleConflictResolutionRequest(ctx);
    assert.equal(result.status, 401);
  }),
);

test(
  'recordConflict: an Operator (not just Admin) can file one, and it stores JSON-stringified versions with admin-only permissions',
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
    assert.deepEqual(createArgs.permissions, [
      'read("label:admin")',
      'update("label:admin")',
    ]);
  }),
);

test(
  'resolveConflict: rejects a non-admin caller with 403',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'resolveConflict', conflictId: 'conflict-1', resolution: 'keep-server' },
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
    });

    const result = await handleConflictResolutionRequest(ctx);
    assert.equal(result.status, 403);
  }),
);

test(
  'resolveConflict: rejects an invalid resolution value with 400',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'resolveConflict', conflictId: 'conflict-1', resolution: 'keep-nonsense' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
    });

    const result = await handleConflictResolutionRequest(ctx);
    assert.equal(result.status, 400);
  }),
);

test(
  'resolveConflict: 404 when the conflict does not exist',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'resolveConflict', conflictId: 'missing', resolution: 'keep-server' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => {
          throw new Error('row_not_found');
        },
      },
    });

    const result = await handleConflictResolutionRequest(ctx);
    assert.equal(result.status, 404);
  }),
);

test(
  'resolveConflict: rejects an already-resolved conflict with 400',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'resolveConflict', conflictId: 'conflict-1', resolution: 'keep-server' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => ({
          $id: 'conflict-1',
          eventId: 'e1',
          localVersion: JSON.stringify(LOCAL_DONATION),
          serverVersion: JSON.stringify(SERVER_DONATION),
          resolvedAt: '2026-01-01T00:00:00.000Z',
        }),
      },
    });

    const result = await handleConflictResolutionRequest(ctx);
    assert.equal(result.status, 400);
  }),
);

test(
  'resolveConflict: keep-server writes nothing to the donations table, only marks the conflict resolved',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'resolveConflict', conflictId: 'conflict-1', resolution: 'keep-server' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => ({
          $id: 'conflict-1',
          eventId: 'e1',
          localVersion: JSON.stringify(LOCAL_DONATION),
          serverVersion: JSON.stringify(SERVER_DONATION),
          resolvedAt: null,
        }),
        updateRow: async (args) => args,
      },
    });

    const result = await handleConflictResolutionRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.donation.donorName, 'Ama (server)');
    // Only one updateRow call: marking the conflict resolved — never a donation-table write.
    assert.equal(calls.updateRow.length, 1);
    assert.equal(calls.updateRow[0][0].tableId, 'conflicts-1');
    assert.equal(calls.updateRow[0][0].data.resolution, 'keep-server');
  }),
);

test(
  'resolveConflict: keep-local overwrites the existing donation row with the local version',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'resolveConflict', conflictId: 'conflict-1', resolution: 'keep-local' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => ({
          $id: 'conflict-1',
          eventId: 'e1',
          localVersion: JSON.stringify(LOCAL_DONATION),
          serverVersion: JSON.stringify(SERVER_DONATION),
          resolvedAt: null,
        }),
        updateRow: async (args) => args,
      },
    });

    const result = await handleConflictResolutionRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(calls.updateRow.length, 2);
    const donationUpdate = calls.updateRow.find((c) => c[0].tableId === 'donations-1')[0];
    assert.equal(donationUpdate.rowId, 'd1');
    assert.equal(donationUpdate.data.donorName, 'Ama (local)');
    const conflictUpdate = calls.updateRow.find((c) => c[0].tableId === 'conflicts-1')[0];
    assert.equal(conflictUpdate.data.resolution, 'keep-local');
  }),
);

test(
  'resolveConflict: keep-both creates a new donation row with a -B receipt suffix and event-derived permissions',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'resolveConflict', conflictId: 'conflict-1', resolution: 'keep-both' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async (args) => {
          if (args.tableId === 'events-1') {
            return { $id: 'e1', assignedUserIds: ['op-1', 'op-2'] };
          }
          return {
            $id: 'conflict-1',
            eventId: 'e1',
            localVersion: JSON.stringify(LOCAL_DONATION),
            serverVersion: JSON.stringify(SERVER_DONATION),
            resolvedAt: null,
          };
        },
        createRow: async (args) => args,
        updateRow: async (args) => args,
      },
    });

    const result = await handleConflictResolutionRequest(ctx);

    assert.equal(result.status, 200);
    const [createArgs] = calls.createRow[0];
    assert.equal(createArgs.tableId, 'donations-1');
    assert.equal(createArgs.data.receiptNumber, 'P-1-B');
    assert.equal(createArgs.data.syncStatus, 'synced');
    assert.ok(createArgs.permissions.includes('read("user:op-1")'));
    assert.ok(createArgs.permissions.includes('read("user:op-2")'));
  }),
);
