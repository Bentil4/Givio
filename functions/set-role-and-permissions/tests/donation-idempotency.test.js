import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDonationRecordingRequest } from '../src/donation-recording.js';
import {
  fakeContext,
  OPERATOR_HEADERS,
  asOperator,
  BASE_PAYLOAD,
  withEnv,
} from './helpers/donation-recording-fixtures.js';

const EVENT = { $id: 'e1', type: 'wedding', status: 'active', assignedUserIds: ['op-1'] };
const SAVED = { $id: 'd1', eventId: 'e1', recordedBy: 'op-1', receiptNumber: 'WEDE1-7' };

function recordAs(userId, tablesDB) {
  return fakeContext({
    body: BASE_PAYLOAD,
    headers: OPERATOR_HEADERS,
    getAccount: asOperator(userId),
    tablesDB: { getRow: async () => ({ ...EVENT, assignedUserIds: [userId] }), ...tablesDB },
  });
}

test(
  'a retried recordDonation whose first response was lost returns the saved row, no new number',
  withEnv(async () => {
    const { ctx, calls } = recordAs('op-1', {
      getDonation: async () => SAVED,
      incrementRowColumn: async () => ({ nextReceiptSeq: 8 }),
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.donation.receiptNumber, 'WEDE1-7');
    assert.equal(calls.incrementRowColumn, undefined);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'the same donation id from a different recorder is a 409 and burns no receipt number',
  withEnv(async () => {
    const { ctx, calls } = recordAs('op-1', {
      getDonation: async () => ({ ...SAVED, recordedBy: 'op-9' }),
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.incrementRowColumn, undefined);
  }),
);

test(
  'the same donation id on a different event is a 409',
  withEnv(async () => {
    const { ctx, calls } = recordAs('op-1', {
      getDonation: async () => ({ ...SAVED, eventId: 'e2' }),
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'a retry still succeeds after the event was paused, and does not touch the event again',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: BASE_PAYLOAD,
      headers: OPERATOR_HEADERS,
      getAccount: asOperator('op-1'),
      tablesDB: {
        getRow: async () => ({ ...EVENT, status: 'paused' }),
        getDonation: async () => SAVED,
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(calls.incrementRowColumn, undefined);
  }),
);

test(
  'a createRow 409 from a concurrent duplicate returns the winning row',
  withEnv(async () => {
    let lookups = 0;
    const { ctx } = recordAs('op-1', {
      getDonation: async () => {
        lookups += 1;
        if (lookups === 1) {
          throw Object.assign(new Error('missing'), { code: 404 });
        }
        return SAVED;
      },
      incrementRowColumn: async () => ({ nextReceiptSeq: 8 }),
      createRow: async () => {
        throw Object.assign(new Error('exists'), { code: 409 });
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.donation.receiptNumber, 'WEDE1-7');
  }),
);

test(
  'a createRow 409 held by a different recorder is a 409',
  withEnv(async () => {
    let lookups = 0;
    const { ctx } = recordAs('op-1', {
      getDonation: async () => {
        lookups += 1;
        if (lookups === 1) {
          throw Object.assign(new Error('missing'), { code: 404 });
        }
        return { ...SAVED, recordedBy: 'op-9' };
      },
      incrementRowColumn: async () => ({ nextReceiptSeq: 8 }),
      createRow: async () => {
        throw Object.assign(new Error('exists'), { code: 409 });
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 409);
  }),
);

test(
  'a failing donation lookup answers 502 instead of recording a possible duplicate',
  withEnv(async () => {
    const { ctx, calls } = recordAs('op-1', {
      getDonation: async () => {
        throw Object.assign(new Error('boom'), { code: 500 });
      },
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 502);
    assert.equal(calls.incrementRowColumn, undefined);
  }),
);

test(
  'a first-time donation is still created with one increment and one createRow',
  withEnv(async () => {
    const { ctx, calls } = recordAs('op-1', {
      incrementRowColumn: async () => ({ nextReceiptSeq: 7 }),
      createRow: async ({ data }) => ({ $id: 'd1', ...data }),
    });

    const result = await handleDonationRecordingRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.donation.receiptNumber, 'WEDE1-7');
    assert.equal(calls.incrementRowColumn.length, 1);
    assert.equal(calls.createRow.length, 1);
  }),
);
