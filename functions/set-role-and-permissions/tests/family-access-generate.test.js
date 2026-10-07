import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleFamilyAccessRequest } from '../src/family-access.js';
import { fakeContext, ADMIN_HEADERS, asAdmin, withEnv } from './helpers/family-access-fixtures.js';

const GENERATE = { action: 'generateAccessCode', eventId: 'e1' };
const asOrganizer = async () => ({ $id: 'org-1', labels: [] });

function withTenantEnv(fn) {
  return withEnv(async () => {
    process.env.APPWRITE_TENANTS_COLLECTION_ID = 'tenants-1';
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID = 'memberships-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_TENANTS_COLLECTION_ID;
      delete process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
    }
  });
}

/** org-1 is an active organizer of approved tenant t1, which owns e1; codes come from `codes`. */
function organizerTables({ codeLookup = async () => ({ total: 0, rows: [] }) } = {}) {
  const membership = { $id: 'm-1', userId: 'org-1', tenantId: 't1', role: 'organizer' };
  return {
    getRow: async ({ tableId }) =>
      tableId === 'tenants-1' ? { $id: 't1', status: 'approved' } : { $id: 'e1', tenantId: 't1' },
    listRows: async (args) =>
      args.tableId === 'memberships-1'
        ? { total: 1, rows: [{ ...membership, status: 'active' }] }
        : codeLookup(args),
    updateRow: async (args) => args,
  };
}

for (const [label, labels] of [
  ['an Operator', ['operator']],
  ['an Admin', ['admin']],
  ['the Super Admin', ['admin', 'superadmin']],
]) {
  test(
    `generateAccessCode: rejects ${label} with 403 before reading the event`,
    withTenantEnv(async () => {
      const { ctx, calls } = fakeContext({
        body: GENERATE,
        headers: ADMIN_HEADERS,
        getAccount: async () => ({ $id: 'caller-1', labels }),
      });
      const result = await handleFamilyAccessRequest(ctx);
      assert.equal(result.status, 403);
      assert.equal(calls.getRow, undefined);
    }),
  );
}

test(
  'generateAccessCode: rejects an unauthenticated request with 401',
  withEnv(async () => {
    const { ctx } = fakeContext({ body: GENERATE, headers: {}, getAccount: asAdmin });
    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 401);
  }),
);

test(
  'generateAccessCode: on success, writes an 8-char code from the safe alphabet and returns it once',
  withTenantEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: GENERATE,
      headers: ADMIN_HEADERS,
      getAccount: asOrganizer,
      tablesDB: organizerTables(),
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
  withTenantEnv(async () => {
    let call = 0;
    const { ctx } = fakeContext({
      body: GENERATE,
      headers: ADMIN_HEADERS,
      getAccount: asOrganizer,
      tablesDB: organizerTables({
        codeLookup: async () => {
          call++;
          return call === 1 ? { total: 1, rows: [{ $id: 'other-event' }] } : { total: 0, rows: [] };
        },
      }),
      randomBytes: (n) =>
        Buffer.from(Array.from({ length: n }, (_, i) => (call === 0 ? i : i + 50))),
    });

    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 200);
    assert.equal(result.body.accessCode.length, 8);
    assert.equal(call, 2);
  }),
);
