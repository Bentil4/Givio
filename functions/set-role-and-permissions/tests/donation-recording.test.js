import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDonationRecordingRequest } from '../src/donation-recording.js';
import {
  fakeContext,
  ADMIN_HEADERS,
  OPERATOR_HEADERS,
  asAdmin,
  asOperator,
  BASE_PAYLOAD,
  withEnv,
} from './helpers/donation-recording-fixtures.js';

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
  "AD-12 amended: an Admin not in the event's assignedUserIds is refused like anyone else",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: BASE_PAYLOAD,
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => ({
          $id: 'e1',
          type: 'wedding',
          status: 'active',
          assignedUserIds: ['op-1'],
        }),
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 403);
    assert.equal(calls.createRow, undefined);
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
        getRow: async () => ({
          $id: 'e1',
          type: 'wedding',
          status: 'active',
          assignedUserIds: ['op-1', 'op-2'],
        }),
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
    assert.deepEqual(create.permissions, ['read("user:op-1")', 'read("user:op-2")']);
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
        getRow: async () => ({
          $id: 'e1',
          type: 'wedding',
          status: 'active',
          assignedUserIds: ['op-1'],
        }),
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
    const event = {
      $id: 'e1',
      type: 'wedding',
      status: 'active',
      assignedUserIds: Array.from({ length: OPERATOR_COUNT }, (_, i) => `op-${i}`),
    };
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
    assert.equal(
      new Set(receiptNumbers).size,
      OPERATOR_COUNT,
      'every receipt number must be unique',
    );

    for (let i = 0; i < OPERATOR_COUNT; i++) {
      const donation = donations.get(`d${i}`);
      assert.equal(
        donation.recordedBy,
        `op-${i}`,
        `donation d${i} must be attributed to its own caller, not another concurrent one`,
      );
      assert.equal(
        donation.donorName,
        `Donor ${i}`,
        `donation d${i} must keep its own payload, not another concurrent one's`,
      );
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
        getRow: async () => ({
          $id: 'e1',
          type: 'wedding',
          status: 'active',
          assignedUserIds: ['op-1'],
        }),
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

test(
  'Story 6.6: rejects with 409, before assigning a receipt number, when the provisional receipt was minted for a different event than the claimed eventId',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { ...BASE_PAYLOAD, receiptNumber: 'FUNZZZZ-P1' },
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
      tablesDB: {
        getRow: async () => ({
          $id: 'e1',
          type: 'wedding',
          status: 'active',
          assignedUserIds: ['op-1'],
        }),
        incrementRowColumn: async () => ({ nextReceiptSeq: 1 }),
        createRow: async () => ({ $id: 'd1' }),
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.incrementRowColumn, undefined);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'Story 6.6: records against the claimed eventId, unchanged, when its provisional receipt matches that event',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { ...BASE_PAYLOAD, receiptNumber: 'WEDE1-P3' },
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
      tablesDB: {
        getRow: async () => ({
          $id: 'e1',
          type: 'wedding',
          status: 'active',
          assignedUserIds: ['op-1'],
        }),
        incrementRowColumn: async () => ({ nextReceiptSeq: 4 }),
        createRow: async () => ({ $id: 'd1' }),
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(calls.getRow[0][0].rowId, 'e1');
    const [create] = calls.createRow[0];
    assert.equal(create.data.eventId, 'e1');
    assert.equal(create.data.receiptNumber, 'WEDE1-4');
  }),
);
