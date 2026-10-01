import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleFamilyAccessRequest } from '../src/family-access.js';
import { fakeContext, ADMIN_HEADERS, asAdmin, withEnv } from './helpers/family-access-fixtures.js';

test(
  'generateAccessCode: rejects a non-admin caller with 403',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'generateAccessCode', eventId: 'e1' },
      headers: { 'x-appwrite-user-jwt': 'op-jwt', 'x-appwrite-key': 'dynamic-key' },
      getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
    });
    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 403);
  }),
);

test(
  'generateAccessCode: rejects an unauthenticated request with 401',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'generateAccessCode', eventId: 'e1' },
      headers: {},
      getAccount: asAdmin,
    });
    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 401);
  }),
);

test(
  'generateAccessCode: 404 when the event does not exist',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'generateAccessCode', eventId: 'missing' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => {
          throw new Error('row_not_found');
        },
      },
    });
    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 404);
  }),
);

test(
  'generateAccessCode: on success, writes an 8-char code from the safe alphabet and returns it once',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'generateAccessCode', eventId: 'e1' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => ({ $id: 'e1' }),
        listRows: async () => ({ total: 0, rows: [] }),
        updateRow: async (args) => args,
      },
    });

    const result = await handleFamilyAccessRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.accessCode.length, 8);
    assert.ok(!/[01OIL]/.test(result.body.accessCode));
    assert.equal(calls.updateRow[0][0].data.accessCode, result.body.accessCode);
  }),
);

test(
  'generateAccessCode: retries on a collision and still succeeds',
  withEnv(async () => {
    let call = 0;
    const { ctx } = fakeContext({
      body: { action: 'generateAccessCode', eventId: 'e1' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => ({ $id: 'e1' }),
        listRows: async () => {
          call++;
          return call === 1 ? { total: 1, rows: [{ $id: 'other-event' }] } : { total: 0, rows: [] };
        },
        updateRow: async (args) => args,
      },
      randomBytes: (n) =>
        Buffer.from(Array.from({ length: n }, (_, i) => (call === 0 ? i : i + 50))),
    });

    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 200);
    assert.equal(result.body.accessCode.length, 8);
  }),
);
