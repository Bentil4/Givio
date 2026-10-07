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

function fakeContext({ body, headers = {}, getAccount, databases = {} }) {
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
      DatabasesCtor,
    },
    jsonCalls,
    logs,
    errors,
    calls,
  };
}

const HEADERS = { 'x-appwrite-user-jwt': 'caller-jwt', 'x-appwrite-key': 'dynamic-key' };
const asOrganizer = async () => ({ $id: 'org-1', labels: [] });
const ASSIGN = { action: 'assignOperators', eventId: 'e1', assignedUserIds: [] };

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

for (const [label, labels] of [
  ['an Admin', ['admin']],
  ['the Super Admin', ['admin', 'superadmin']],
  ['an Operator', ['operator']],
]) {
  test(
    `AD-12 amended: ${label} is refused with 403 before any event is read`,
    withEnv(async () => {
      const { ctx, calls } = fakeContext({
        body: { ...ASSIGN, assignedUserIds: ['op-1'] },
        headers: HEADERS,
        getAccount: async () => ({ $id: 'caller-1', labels }),
      });

      const result = await handleEventAssignmentRequest(ctx);

      assert.equal(result.status, 403);
      assert.equal(calls.getRow, undefined);
      assert.equal(calls.updateRow, undefined);
    }),
  );
}

test(
  "AD-12 amended: Admin's former setEventStatus action no longer exists",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setEventStatus', eventId: 'e1', status: 'paused' },
      headers: HEADERS,
      getAccount: asOrganizer,
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 400);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'rejects a missing eventId with 400 before touching Databases',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'assignOperators', assignedUserIds: [] },
      headers: HEADERS,
      getAccount: asOrganizer,
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
      body: { ...ASSIGN, assignedUserIds: 'op-1' },
      headers: HEADERS,
      getAccount: asOrganizer,
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 400);
  }),
);

test(
  'returns a distinct 500 when the dynamic x-appwrite-key is missing',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: ASSIGN,
      headers: { 'x-appwrite-user-jwt': 'caller-jwt' },
      getAccount: asOrganizer,
    });

    const result = await handleEventAssignmentRequest(ctx);

    assert.equal(result.status, 500);
  }),
);

test('returns a distinct 500 when APPWRITE_DATABASE_ID/APPWRITE_EVENTS_COLLECTION_ID are not configured', async () => {
  delete process.env.APPWRITE_DATABASE_ID;
  delete process.env.APPWRITE_EVENTS_COLLECTION_ID;

  const { ctx } = fakeContext({ body: ASSIGN, headers: HEADERS, getAccount: asOrganizer });

  const result = await handleEventAssignmentRequest(ctx);

  assert.equal(result.status, 500);
});
