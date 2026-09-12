import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDonationRecordingRequest } from '../src/donation-recording.js';

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
    incrementRowColumn = record('incrementRowColumn', tablesDB);
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

const BASE_PAYLOAD = {
  action: 'recordDonation',
  donationId: 'd1',
  eventId: 'e1',
  receiptNumber: 'P-1',
  donorName: 'Ama',
  amountMinor: 5000,
  donationType: 'cash',
  recordedAt: '2026-01-01T00:00:00.000Z',
};

function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_EVENTS_COLLECTION_ID = 'events-1';
    process.env.APPWRITE_DONATIONS_COLLECTION_ID = 'donations-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
      delete process.env.APPWRITE_DONATIONS_COLLECTION_ID;
    }
  };
}

test(
  'rejects an unauthenticated request with 401',
  withEnv(async () => {
    const { ctx } = fakeContext({ body: BASE_PAYLOAD, headers: {}, getAccount: asAdmin });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 401);
  }),
);

test(
  'rejects an unknown action with 400',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'notARealAction' },
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 400);
  }),
);

test(
  'rejects a missing donorName with 400 before touching TablesDB',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { ...BASE_PAYLOAD, donorName: undefined },
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 400);
    assert.equal(calls.getRow, undefined);
  }),
);

test(
  'returns a distinct 500 when the dynamic x-appwrite-key is missing',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: BASE_PAYLOAD,
      headers: { 'x-appwrite-user-jwt': 'op-jwt' },
      getAccount: asOperator('op-1'),
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 500);
  }),
);

test('returns a distinct 500 when the function variables are not configured', async () => {
  const { ctx } = fakeContext({
    body: BASE_PAYLOAD,
    headers: OPERATOR_HEADERS,
    getAccount: asOperator('op-1'),
  });

  const result = await handleDonationRecordingRequest(ctx);

  assert.equal(result.status, 500);
});

test(
  'returns 404 when the event does not exist',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: BASE_PAYLOAD,
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
      tablesDB: {
        getRow: async () => {
          throw new Error('row_not_found');
        },
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 404);
  }),
);

test(
  'rejects an operator who is not assigned to the event with 403',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: BASE_PAYLOAD,
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-2'),
      tablesDB: {
        getRow: async () => ({ $id: 'e1', status: 'active', assignedUserIds: ['op-1'] }),
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 403);
  }),
);

test(
  'rejects a donation against a paused event with 400',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: BASE_PAYLOAD,
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
      tablesDB: {
        getRow: async () => ({ $id: 'e1', status: 'paused', assignedUserIds: ['op-1'] }),
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 400);
    assert.match(result.body.error, /paused or closed/);
  }),
);

test(
  "admin can record a donation even when not in the event's assignedUserIds",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: BASE_PAYLOAD,
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => ({ $id: 'e1', type: 'wedding', status: 'active', assignedUserIds: ['op-1'] }),
        incrementRowColumn: async () => ({ nextReceiptSeq: 1 }),
        createRow: async () => ({ $id: 'd1' }),
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(calls.createRow.length, 1);
  }),
);

test(
  'on success, assigns the canonical receipt number (event short code + atomic nextReceiptSeq), not the client-sent provisional one',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: BASE_PAYLOAD,
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
      tablesDB: {
        getRow: async () => ({ $id: 'e1', type: 'wedding', status: 'active', assignedUserIds: ['op-1', 'op-2'] }),
        incrementRowColumn: async () => ({ nextReceiptSeq: 7 }),
        createRow: async () => ({ $id: 'd1' }),
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 200);
    const [increment] = calls.incrementRowColumn[0];
    assert.equal(increment.databaseId, 'db-1');
    assert.equal(increment.tableId, 'events-1');
    assert.equal(increment.rowId, 'e1');
    assert.equal(increment.column, 'nextReceiptSeq');
    assert.equal(increment.value, 1);

    const [create] = calls.createRow[0];
    assert.equal(create.rowId, 'd1');
    assert.equal(create.data.receiptNumber, 'WEDE1-7');
    assert.notEqual(create.data.receiptNumber, BASE_PAYLOAD.receiptNumber);
    assert.equal(create.data.recordedBy, 'op-1');
    assert.equal(create.data.syncStatus, 'synced');
    assert.equal(create.permissions.length, 5); // 3 admin + 2 operator
  }),
);

test(
  'returns a structured 502, not a throw, when the atomic nextReceiptSeq increment fails',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: BASE_PAYLOAD,
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
      tablesDB: {
        getRow: async () => ({ $id: 'e1', type: 'wedding', status: 'active', assignedUserIds: ['op-1'] }),
        incrementRowColumn: async () => {
          throw new Error('boom');
        },
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 502);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  // Story 5.3 AC1 ("10+ concurrent Operators... no data race conditions... isolated by the
  // recording Operator's user ID"): every prior test in this file calls the handler once.
  // This one actually runs many calls concurrently (Promise.all, not sequential awaits) against
  // a SHARED fake TablesDB — a single events map and a single donations map, exactly like 10+
  // Operators hitting the same live event — to prove the handler carries no shared mutable
  // state across concurrent invocations (all per-call locals) and that Appwrite's
  // incrementRowColumn is what the code actually depends on for uniqueness, not something the
  // handler itself has to (and could get wrong) coordinate.
  '10 concurrent operators recording against the same event get unique receipt numbers and correct per-caller attribution',
  withEnv(async () => {
    const OPERATOR_COUNT = 10;
    const event = { $id: 'e1', type: 'wedding', status: 'active', assignedUserIds: Array.from({ length: OPERATOR_COUNT }, (_, i) => `op-${i}`) };
    const donations = new Map();
    let nextReceiptSeq = 0;

    const sharedTablesDB = {
      getRow: async () => event,
      // A synchronous read-increment-write (no internal await) models Appwrite's real atomic
      // increment: in single-threaded Node, nothing can interleave between the read and the
      // write of a local variable, so this is a faithful stand-in for the server-side guarantee
      // the handler relies on.
      incrementRowColumn: async () => {
        nextReceiptSeq += 1;
        return { ...event, nextReceiptSeq };
      },
      createRow: async ({ rowId, data }) => {
        donations.set(rowId, data);
        return { $id: rowId, ...data };
      },
    };

    const results = await Promise.all(
      Array.from({ length: OPERATOR_COUNT }, (_, i) => {
        const { ctx } = fakeContext({
          body: { ...BASE_PAYLOAD, donationId: `d${i}`, donorName: `Donor ${i}` },
          headers: { 'x-appwrite-user-jwt': `op-${i}-jwt`, 'x-appwrite-key': 'dynamic-key' },
          getAccount: asOperator(`op-${i}`),
          tablesDB: sharedTablesDB,
        });
        return handleDonationRecordingRequest(ctx);
      }),
    );

    for (const result of results) {
      assert.equal(result.status, 200);
    }

    assert.equal(donations.size, OPERATOR_COUNT);
    const receiptNumbers = [...donations.values()].map((d) => d.receiptNumber);
    assert.equal(new Set(receiptNumbers).size, OPERATOR_COUNT, 'every receipt number must be unique');

    for (let i = 0; i < OPERATOR_COUNT; i++) {
      const donation = donations.get(`d${i}`);
      assert.equal(donation.recordedBy, `op-${i}`, `donation d${i} must be attributed to its own caller, not another concurrent one`);
      assert.equal(donation.donorName, `Donor ${i}`, `donation d${i} must keep its own payload, not another concurrent one's`);
    }
  }),
);

test(
  'returns a structured 502, not a throw, when createRow fails',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: BASE_PAYLOAD,
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
      tablesDB: {
        getRow: async () => ({ $id: 'e1', type: 'wedding', status: 'active', assignedUserIds: ['op-1'] }),
        incrementRowColumn: async () => ({ nextReceiptSeq: 1 }),
        createRow: async () => {
          throw new Error('boom');
        },
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 502);
  }),
);
