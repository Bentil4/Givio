import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest, isTenantIntakeComplete } from '../src/tenant-membership.js';
import {
  fakeContext,
  ADMIN_HEADERS,
  asAdmin,
  asOperator,
  withEnv,
  COMPANY,
} from './helpers/tenant-membership-fixtures.js';

test(
  'setTenantStatus rejects a verified non-admin caller with 403',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
      ...asOperator,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 403);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'setTenantStatus rejects an illegal transition with 400',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: { getRow: async () => ({ $id: 't1', status: 'pending' }) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 400);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  "setTenantStatus('suspended') clears permissions on every Event the tenant owns, verified via the actual query filter",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 't1', status: 'approved' }),
        updateRow: async () => ({}),
        listRows: async (args) => {
          const tenantFilter = JSON.stringify({
            method: 'equal',
            attribute: 'tenantId',
            values: ['t1'],
          });
          if (!args.queries.includes(tenantFilter)) {
            return { rows: [] };
          }
          return {
            rows: [
              { $id: 'event-1', assignedUserIds: ['u1'] },
              { $id: 'event-2', assignedUserIds: ['u2'] },
            ],
          };
        },
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'suspended');
    // Tenant status update + two swept Events.
    assert.equal(calls.updateRow.length, 3);
    const tenantUpdate = calls.updateRow[0][0];
    assert.equal(tenantUpdate.data.status, 'suspended');
    // Every Event's permissions are fully cleared (no Role.user grant left at all).
    assert.deepEqual(
      calls.updateRow[1][0].permissions.filter((p) => p.includes('user:')),
      [],
    );
    assert.deepEqual(
      calls.updateRow[2][0].permissions.filter((p) => p.includes('user:')),
      [],
    );
  }),
);

test(
  "setTenantStatus('suspended') returns 502 (not a false 200) when listing the tenant's events fails",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 't1', status: 'approved' }),
        updateRow: async () => ({}),
        listRows: async () => Promise.reject(new Error('network error')),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    // The tenant's status row was already written (updateRow[0]) — the failure is reported,
    // not silently swallowed as a false success.
    assert.equal(result.status, 502);
    assert.equal(calls.updateRow.length, 1);
  }),
);

test(
  "setTenantStatus('suspended') on an already-suspended tenant retries just the sweep, not rejected as a no-op transition",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        // Tenant is ALREADY suspended — the earlier attempt's status write succeeded but its
        // sweep must have failed (the previous test's scenario), leaving stale Event grants.
        getRow: async () => ({ $id: 't1', status: 'suspended' }),
        listRows: async ({ tableId }) => ({
          rows: tableId === 'events-1' ? [{ $id: 'event-1', assignedUserIds: ['u1'] }] : [],
        }),
        updateRow: async () => ({}),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'suspended');
    // No tenant-status write this time (already in that state) — only the swept Event.
    assert.equal(calls.updateRow.length, 1);
    assert.equal(calls.updateRow[0][0].rowId, 'event-1');
  }),
);

test(
  'listAllRows drains a full page and follows the cursor to a second page',
  withEnv(async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      $id: `event-${i}`,
      assignedUserIds: ['u1'],
    }));
    const page2 = [{ $id: 'event-100', assignedUserIds: ['u1'] }];
    let callCount = 0;

    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 't1', status: 'approved' }),
        updateRow: async () => ({}),
        listRows: async ({ tableId }) => {
          if (tableId !== 'events-1') return { rows: [] };
          callCount += 1;
          return { rows: callCount === 1 ? page1 : page2 };
        },
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(callCount, 2);
    // The second listRows call carries a cursorAfter for the last row of page 1.
    const [secondCallArgs] = calls.listRows.filter(([args]) => args.tableId === 'events-1')[1];
    assert.ok(
      secondCallArgs.queries.some(
        (q) => q.includes('"method":"cursorAfter"') && q.includes('event-99'),
      ),
    );
    // updateRow[0] is the tenant's own approved->suspended status write; the remaining 101
    // calls are every row from both pages of the paginated sweep (100 + 1).
    assert.equal(calls.updateRow.length, 102);
    assert.equal(calls.updateRow[0][0].tableId, 'tenants-1');
  }),
);

test('isTenantIntakeComplete requires every intake field and the verification document', () => {
  const complete = { ...COMPANY, verificationDocumentId: 'file-1' };
  assert.equal(isTenantIntakeComplete(complete), true);
  assert.equal(isTenantIntakeComplete({ ...complete, verificationDocumentId: undefined }), false);
  assert.equal(isTenantIntakeComplete({ ...complete, estimatedUserCount: undefined }), false);
  assert.equal(isTenantIntakeComplete({ ...complete, type: '' }), false);
});

test(
  'setTenantStatus refuses to approve a pending Tenant whose intake is incomplete',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'approved' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: { getRow: async () => ({ $id: 't1', status: 'pending', ...COMPANY }) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'setTenantStatus approves a pending Tenant whose intake is complete',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'approved' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({
          $id: 't1',
          status: 'pending',
          ...COMPANY,
          verificationDocumentId: 'file-1',
          verifiedBy: 'admin-1',
          verifiedAt: '2026-09-30T10:00:00.000Z',
        }),
        updateRow: async () => ({}),
        listRows: async () => ({ rows: [] }),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(calls.updateRow[0][0].data.status, 'approved');
  }),
);
