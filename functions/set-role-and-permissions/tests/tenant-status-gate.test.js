import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDonationRecordingRequest } from '../src/donation-recording.js';
import { handleConflictResolutionRequest } from '../src/conflict-resolution.js';

// Story 6.4 (FR-9): every action a non-Admin can call refuses a caller whose Tenant isn't
// approved — while today's Label-based Operators and Admins (no Membership row) pass unchanged.

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

function fakeContext({ body, account, memberships = [], tenants = {}, listRowsImpl }) {
  const calls = {};
  const record = (name, impl) => async (args) => {
    calls[name] = calls[name] ?? [];
    calls[name].push(args);
    return impl(args);
  };

  class TablesDBCtor {
    listRows = record(
      'listRows',
      listRowsImpl ??
        (async ({ tableId }) => ({ rows: tableId === 'memberships-1' ? memberships : [] })),
    );
    getRow = record('getRow', async ({ tableId, rowId }) => {
      if (tableId === 'tenants-1') return tenants[rowId];
      if (tableId === 'donations-1') throw Object.assign(new Error('not found'), { code: 404 });
      return { $id: 'e1', type: 'wedding', status: 'active', assignedUserIds: [account.$id] };
    });
    incrementRowColumn = record('incrementRowColumn', async () => ({ nextReceiptSeq: 1 }));
    createRow = record('createRow', async () => ({ $id: 'row-1', receiptNumber: 'X-1' }));
    updateRow = record('updateRow', async () => ({}));
  }

  class AccountCtor {
    async get() {
      return account;
    }
  }

  return {
    ctx: {
      req: {
        bodyRaw: JSON.stringify(body),
        headers: { 'x-appwrite-user-jwt': 'jwt', 'x-appwrite-key': 'dynamic-key' },
      },
      res: { json: (responseBody, status = 200) => ({ body: responseBody, status }) },
      log: () => {},
      error: () => {},
      ClientCtor: FakeClient,
      AccountCtor,
      TablesDBCtor,
    },
    calls,
  };
}

function withEnv(fn) {
  const vars = {
    APPWRITE_DATABASE_ID: 'db-1',
    APPWRITE_EVENTS_COLLECTION_ID: 'events-1',
    APPWRITE_DONATIONS_COLLECTION_ID: 'donations-1',
    APPWRITE_DONATION_CONFLICTS_COLLECTION_ID: 'conflicts-1',
    APPWRITE_TENANTS_COLLECTION_ID: 'tenants-1',
    APPWRITE_MEMBERSHIPS_COLLECTION_ID: 'memberships-1',
  };
  return async () => {
    Object.assign(process.env, vars);
    try {
      await fn();
    } finally {
      for (const key of Object.keys(vars)) delete process.env[key];
    }
  };
}

const DONATION = {
  action: 'recordDonation',
  donationId: 'd1',
  eventId: 'e1',
  receiptNumber: 'P-1',
  donorName: 'Ama',
  amountMinor: 5000,
  donationType: 'cash',
  recordedAt: '2026-01-01T00:00:00.000Z',
};
const CONFLICT = {
  action: 'recordConflict',
  receiptNumber: 'P-1',
  eventId: 'e1',
  localVersion: {},
  serverVersion: {},
};

const HANDLERS = [
  ['recordDonation', handleDonationRecordingRequest, DONATION],
  ['recordConflict', handleConflictResolutionRequest, CONFLICT],
];

const organizer = { $id: 'org-1', labels: [] };
const membershipAt = (status = 'active') => [
  { $id: 'm1', userId: 'org-1', tenantId: 't1', role: 'super_organizer', status },
];

for (const [name, handler, body] of HANDLERS) {
  test(
    `${name}: a Label-based Operator with no Membership row passes the gate unchanged`,
    withEnv(async () => {
      const operator = { $id: 'op-1', labels: ['operator'] };
      const { ctx, calls } = fakeContext({ body, account: operator });

      const result = await handler(ctx);

      assert.equal(result.status, 200);
      assert.equal(calls.listRows.length, 1);
      assert.equal(calls.createRow.length, 1);
    }),
  );

  test(
    `${name}: an Admin passes without any Membership lookup`,
    withEnv(async () => {
      const admin = { $id: 'admin-1', labels: ['admin'] };
      const { ctx, calls } = fakeContext({ body, account: admin });

      const result = await handler(ctx);

      assert.equal(result.status, 200);
      assert.equal(calls.listRows, undefined);
    }),
  );

  for (const tenantStatus of ['pending', 'rejected', 'suspended']) {
    test(
      `${name}: refuses an Organizer whose Tenant is ${tenantStatus}`,
      withEnv(async () => {
        const { ctx, calls } = fakeContext({
          body,
          account: organizer,
          memberships: membershipAt(),
          tenants: { t1: { $id: 't1', status: tenantStatus } },
        });

        const result = await handler(ctx);

        assert.equal(result.status, 403);
        assert.equal(calls.createRow, undefined);
      }),
    );
  }

  test(
    `${name}: refuses a caller whose Membership is revoked`,
    withEnv(async () => {
      const { ctx, calls } = fakeContext({
        body,
        account: organizer,
        memberships: membershipAt('revoked'),
        tenants: { t1: { $id: 't1', status: 'approved' } },
      });

      const result = await handler(ctx);

      assert.equal(result.status, 403);
      assert.equal(calls.createRow, undefined);
    }),
  );

  test(
    `${name}: lets an approved Tenant's active member through`,
    withEnv(async () => {
      const { ctx } = fakeContext({
        body,
        account: organizer,
        memberships: membershipAt(),
        tenants: { t1: { $id: 't1', status: 'approved' } },
      });

      const result = await handler(ctx);

      assert.equal(result.status, 200);
    }),
  );

  test(
    `${name}: fails closed (502) when the Membership lookup fails`,
    withEnv(async () => {
      const { ctx, calls } = fakeContext({
        body,
        account: organizer,
        listRowsImpl: async () => Promise.reject(new Error('down')),
      });

      const result = await handler(ctx);

      assert.equal(result.status, 502);
      assert.equal(calls.createRow, undefined);
    }),
  );
}
