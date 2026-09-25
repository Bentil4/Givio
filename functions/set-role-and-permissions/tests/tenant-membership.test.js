import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';

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

function fakeContext({ body, headers = {}, getAccount, databases = {}, users = {} }) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];
  const calls = {};

  const record =
    (name, impls) =>
    async (...args) => {
      calls[name] = calls[name] ?? [];
      calls[name].push(args);
      const impl = impls[name];
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
    createRow = record('createRow', databases);
    listRows = record('listRows', databases);
  }

  class UsersCtor {
    get = record('usersGet', users);
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
const asOperator = {
  headers: { 'x-appwrite-user-jwt': 'operator-jwt' },
  getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
};

// Baseline createMembership fixture: tenant exists, user exists, no existing active Membership.
const CREATE_MEMBERSHIP_HAPPY_PATH_DBS = {
  getRow: async () => ({ $id: 't1', status: 'pending' }),
  listRows: async () => ({ rows: [] }),
  createRow: async () => ({ $id: 'membership-1' }),
};
const CREATE_MEMBERSHIP_HAPPY_PATH_USERS = { usersGet: async () => ({ $id: 'u1' }) };

function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_EVENTS_COLLECTION_ID = 'events-1';
    process.env.APPWRITE_TENANTS_COLLECTION_ID = 'tenants-1';
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID = 'memberships-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
      delete process.env.APPWRITE_TENANTS_COLLECTION_ID;
      delete process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
    }
  };
}

test(
  'rejects a verified non-admin caller with 403',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'createMembership', userId: 'u1', tenantId: 't1', role: 'operator' },
      ...asOperator,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 403);
    assert.equal(calls.createRow, undefined);
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

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 400);
  }),
);

test(
  'createMembership writes the expected row and permissions',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'createMembership', userId: 'u1', tenantId: 't1', role: 'operator' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: CREATE_MEMBERSHIP_HAPPY_PATH_DBS,
      users: CREATE_MEMBERSHIP_HAPPY_PATH_USERS,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.membershipId, 'membership-1');
    const [createArgs] = calls.createRow[0];
    assert.equal(createArgs.data.userId, 'u1');
    assert.equal(createArgs.data.tenantId, 't1');
    assert.equal(createArgs.data.role, 'operator');
    assert.equal(createArgs.data.status, 'active');
    assert.equal(createArgs.data.grantedBy, 'admin-1');
    assert.deepEqual(createArgs.permissions, ['read("label:admin")', 'read("user:u1")']);
  }),
);

test(
  'createMembership rejects an invalid role with 400',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'createMembership', userId: 'u1', tenantId: 't1', role: 'super-admin' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 400);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'createMembership rejects a nonexistent tenantId with 404, before checking the user',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: {
        action: 'createMembership',
        userId: 'u1',
        tenantId: 'bogus-tenant',
        role: 'operator',
      },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: { getRow: async () => Promise.reject(new Error('not found')) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 404);
    assert.equal(calls.usersGet, undefined);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'createMembership succeeds against a pending tenant — self-signup provisions the Super Organizer Membership before approval',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'createMembership', userId: 'u1', tenantId: 't1', role: 'super_organizer' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        ...CREATE_MEMBERSHIP_HAPPY_PATH_DBS,
        getRow: async () => ({ $id: 't1', status: 'pending' }),
      },
      users: CREATE_MEMBERSHIP_HAPPY_PATH_USERS,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
  }),
);

test(
  'createMembership rejects a userId with no matching account with 404',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'createMembership', userId: 'ghost', tenantId: 't1', role: 'operator' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: CREATE_MEMBERSHIP_HAPPY_PATH_DBS,
      users: { usersGet: async () => Promise.reject(new Error('not found')) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 404);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'createMembership rejects a user who already holds an active membership with 409',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'createMembership', userId: 'u1', tenantId: 't2', role: 'operator' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        ...CREATE_MEMBERSHIP_HAPPY_PATH_DBS,
        listRows: async () => ({
          rows: [{ $id: 'existing-membership', userId: 'u1', status: 'active' }],
        }),
      },
      users: CREATE_MEMBERSHIP_HAPPY_PATH_USERS,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'revokeMembership rejects a verified non-admin caller with 403',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'revokeMembership', membershipId: 'membership-1' },
      ...asOperator,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 403);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'revokeMembership sets status to revoked and sweeps affected Events, paginating the lookup',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'revokeMembership', membershipId: 'membership-1' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 'membership-1', userId: 'u1', tenantId: 't1' }),
        updateRow: async () => ({}),
        listRows: async () => ({ rows: [{ $id: 'event-1', assignedUserIds: ['u1', 'u2'] }] }),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'revoked');
    // First updateRow call is the Membership itself; second is the swept Event.
    const membershipUpdate = calls.updateRow[0][0];
    assert.equal(membershipUpdate.data.status, 'revoked');
    const eventUpdate = calls.updateRow[1][0];
    assert.equal(eventUpdate.rowId, 'event-1');
    // u1 (revoked) is dropped from the derived permissions; u2 (unaffected) is retained.
    assert.ok(eventUpdate.permissions.some((p) => p.includes('u2')));
    assert.ok(!eventUpdate.permissions.some((p) => p.includes('"user:u1"')));
    // The sweep's listRows call is scoped to this membership's own tenant+userId, not a blanket query.
    const [listArgs] = calls.listRows[0];
    assert.deepEqual(listArgs.queries.slice(0, 2), [
      JSON.stringify({ method: 'equal', attribute: 'tenantId', values: ['t1'] }),
      JSON.stringify({ method: 'contains', attribute: 'assignedUserIds', values: ['u1'] }),
    ]);
  }),
);

test(
  "revokeMembership returns 502 (not a false 200) when the sweep's Event lookup fails",
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'revokeMembership', membershipId: 'membership-1' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 'membership-1', userId: 'u1', tenantId: 't1' }),
        updateRow: async () => ({}),
        listRows: async () => Promise.reject(new Error('network error')),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 502);
  }),
);

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
        listRows: async () => ({ rows: [{ $id: 'event-1', assignedUserIds: ['u1'] }] }),
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
        listRows: async () => {
          callCount += 1;
          return { rows: callCount === 1 ? page1 : page2 };
        },
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(callCount, 2);
    // The second listRows call carries a cursorAfter for the last row of page 1.
    const [secondCallArgs] = calls.listRows[1];
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
