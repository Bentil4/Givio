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

function fakeContext({ body, headers = {}, getAccount, databases = {} }) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];
  const calls = {};

  const record =
    (name) =>
    async (...args) => {
      calls[name] = calls[name] ?? [];
      calls[name].push(args);
      const impl = databases[name];
      return impl ? impl(...args) : undefined;
    };

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }

  class DatabasesCtor {
    getRow = record('getRow');
    updateRow = record('updateRow');
    createRow = record('createRow');
    listRows = record('listRows');
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

const ADMIN_HEADERS = { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'dynamic-key' };
const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });

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
      headers: { 'x-appwrite-user-jwt': 'operator-jwt' },
      getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
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
      databases: { createRow: async () => ({ $id: 'membership-1' }) },
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
  'revokeMembership sets status to revoked and sweeps affected Events',
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
  "setTenantStatus('suspended') sweeps every Event the tenant currently grants",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 't1', status: 'approved' }),
        updateRow: async () => ({}),
        listRows: async (args) => {
          // Distinguish the "tenant's own events" lookup from the sweep's own listRows call —
          // both query events-1, but only the first two calls (tenant status transition) needs
          // every Event; the sweep's own listRows (inside sweepTenantEventPermissions) reuses
          // the same fixture data, which is fine since both should return the same tenant events.
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
  }),
);
