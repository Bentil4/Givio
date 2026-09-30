import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest, isTenantIntakeComplete } from '../src/tenant-membership.js';

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

function fakeContext({
  body,
  headers = {},
  getAccount,
  databases = {},
  users = {},
  storage = {},
  messaging = {},
}) {
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
    deleteRow = record('deleteRow', databases);
  }

  class UsersCtor {
    get = record('usersGet', users);
    create = record('usersCreate', users);
    delete = record('usersDelete', users);
  }

  class StorageCtor {
    getFile = record('getFile', storage);
    updateFile = record('updateFile', storage);
  }

  class MessagingCtor {
    createEmail = record('createEmail', messaging);
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
      StorageCtor,
      MessagingCtor,
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
    process.env.APPWRITE_TENANT_DOCUMENTS_BUCKET_ID = 'tenant-docs-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
      delete process.env.APPWRITE_TENANTS_COLLECTION_ID;
      delete process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
      delete process.env.APPWRITE_TENANT_DOCUMENTS_BUCKET_ID;
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

test(
  'addTeamMember rejects a verified non-admin caller with 403',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: {
        action: 'addTeamMember',
        name: 'Kwesi',
        email: 'kwesi@example.com',
        tenantId: 't1',
        role: 'operator',
      },
      ...asOperator,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 403);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  'addTeamMember rejects a nonexistent tenantId with 404, before touching Users',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: {
        action: 'addTeamMember',
        name: 'Kwesi',
        email: 'kwesi@example.com',
        tenantId: 'bogus',
        role: 'operator',
      },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: { getRow: async () => Promise.reject(new Error('not found')) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 404);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  'addTeamMember rejects a missing/invalid role with 400 before touching the database',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: {
        action: 'addTeamMember',
        name: 'Kwesi',
        email: 'kwesi@example.com',
        tenantId: 't1',
        role: 'ceo',
      },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 400);
    assert.equal(calls.getRow, undefined);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  'addTeamMember rejects a suspended or rejected tenant with 409, before creating an Account',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: {
        action: 'addTeamMember',
        name: 'Kwesi',
        email: 'kwesi@example.com',
        tenantId: 't1',
        role: 'operator',
      },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: { getRow: async () => ({ $id: 't1', status: 'suspended' }) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  "addTeamMember creates a new Account and Membership for the target person, never the caller's own credentials (AC1, AC3)",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: {
        action: 'addTeamMember',
        name: 'Kwesi Boateng',
        email: 'kwesi@example.com',
        tenantId: 't1',
        role: 'operator',
      },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 't1', status: 'approved' }),
        createRow: async () => ({ $id: 'membership-new' }),
      },
      users: { usersCreate: async () => ({ $id: 'account-new' }) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.userId, 'account-new');
    assert.equal(result.body.membershipId, 'membership-new');
    assert.ok(result.body.generatedPassword);
    // The Account created is for the target person, never a reference to the caller ("admin-1").
    const [createUserArgs] = calls.usersCreate[0];
    assert.equal(createUserArgs.email, 'kwesi@example.com');
    assert.equal(createUserArgs.name, 'Kwesi Boateng');
    assert.notEqual(createUserArgs.userId, 'admin-1');
    // The Membership row is written against the newly-created Account, not the caller.
    const [createRowArgs] = calls.createRow[0];
    assert.equal(createRowArgs.data.userId, 'account-new');
    assert.equal(createRowArgs.data.grantedBy, 'admin-1');
    // The ACL this story exists to guarantee: only Admin and the new Account itself can read
    // the Membership row — no other uid, no tenant-wide grant.
    assert.deepEqual(createRowArgs.permissions, [
      'read("label:admin")',
      'read("user:account-new")',
    ]);
  }),
);

test(
  'addTeamMember returns the new Account (userId + generatedPassword) alongside the error when the Membership write fails, so it can be recovered via createMembership',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: {
        action: 'addTeamMember',
        name: 'Kwesi',
        email: 'kwesi@example.com',
        tenantId: 't1',
        role: 'operator',
      },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 't1', status: 'approved' }),
        createRow: async () => Promise.reject(new Error('network error')),
      },
      users: { usersCreate: async () => ({ $id: 'account-new' }) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 502);
    assert.equal(result.body.userId, 'account-new');
    assert.ok(result.body.generatedPassword);
  }),
);

test(
  "addTeamMember's generated password is never written to the Function's success log",
  withEnv(async () => {
    const { ctx, logs } = fakeContext({
      body: {
        action: 'addTeamMember',
        name: 'Kwesi Boateng',
        email: 'kwesi@example.com',
        tenantId: 't1',
        role: 'operator',
      },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () => ({ $id: 't1', status: 'approved' }),
        createRow: async () => ({ $id: 'membership-new' }),
      },
      users: { usersCreate: async () => ({ $id: 'account-new' }) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    const realPassword = result.body.generatedPassword;
    assert.ok(realPassword);
    assert.equal(logs.length, 1);
    assert.ok(!logs[0].includes(realPassword));
    assert.ok(logs[0].includes('[redacted]'));
  }),
);

test(
  'addTeamMember returns 409 and never calls createRow when the email already has an Account (AC1)',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: {
        action: 'addTeamMember',
        name: 'Kwesi',
        email: 'kwesi@example.com',
        tenantId: 't1',
        role: 'operator',
      },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: { getRow: async () => ({ $id: 't1', status: 'approved' }) },
      users: {
        usersCreate: async () => {
          const err = new Error('user_email_already_exists');
          err.code = 409;
          throw err;
        },
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    // The assertion that actually matters: no Membership was ever attached to the existing Account.
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  "revoking one person's Membership never touches a separate person's Membership at another tenant (AC2)",
  withEnv(async () => {
    // Code-review fix: a REAL two-tenant fixture, filtered by the query args the production
    // code actually sends — not a fixed response that merely never mentions tenant-b. If
    // handleRevokeMembership/sweepTenantEventPermissions ever dropped or broadened their
    // Query.equal('tenantId', ...) filter, this fake would start returning event-b1 too and
    // the assertions below would catch it; the previous version of this test could not.
    const allEvents = [
      { $id: 'event-a1', tenantId: 'tenant-a', assignedUserIds: ['user-a'] },
      { $id: 'event-b1', tenantId: 'tenant-b', assignedUserIds: ['user-b'] },
    ];
    const membershipsById = {
      'membership-a': { $id: 'membership-a', userId: 'user-a', tenantId: 'tenant-a' },
      'membership-b': { $id: 'membership-b', userId: 'user-b', tenantId: 'tenant-b' },
    };

    const { ctx, calls } = fakeContext({
      body: { action: 'revokeMembership', membershipId: 'membership-a' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async ({ rowId }) => membershipsById[rowId],
        updateRow: async () => ({}),
        listRows: async ({ queries }) => {
          const parsed = queries.map((q) => JSON.parse(q));
          const tenantFilter = parsed.find(
            (q) => q.method === 'equal' && q.attribute === 'tenantId',
          );
          const containsFilter = parsed.find(
            (q) => q.method === 'contains' && q.attribute === 'assignedUserIds',
          );
          const rows = allEvents.filter((event) => {
            if (tenantFilter && !tenantFilter.values.includes(event.tenantId)) return false;
            if (
              containsFilter &&
              !event.assignedUserIds.some((uid) => containsFilter.values.includes(uid))
            ) {
              return false;
            }
            return true;
          });
          return { rows };
        },
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    // Exactly the Membership update + event-a1's update — event-b1 was excluded by the real
    // query filter applied against a fixture that genuinely contained it, not by never being
    // in scope to begin with.
    assert.equal(calls.updateRow.length, 2);
    assert.equal(calls.updateRow[0][0].rowId, 'membership-a');
    assert.equal(calls.updateRow[1][0].rowId, 'event-a1');
    assert.ok(!calls.updateRow.some(([args]) => args.rowId === 'event-b1'));
  }),
);

// ── Story 6.4: Organizer onboarding ─────────────────────────────────────────

const APPLICANT_HEADERS = {
  'x-appwrite-user-jwt': 'applicant-jwt',
  'x-appwrite-key': 'dynamic-key',
};
const asApplicant = async () => ({ $id: 'applicant-1', labels: [] });
const COMPANY = {
  name: 'Asante Events',
  location: 'Kumasi',
  size: '11-50',
  type: 'funeral',
  estimatedUserCount: 12,
};
const applicationBody = (overrides = {}) => ({
  action: 'submitTenantApplication',
  company: COMPANY,
  verificationDocumentId: 'file-1',
  ...overrides,
});
const APPLICANT_FILE = {
  $id: 'file-1',
  mimeType: 'application/pdf',
  $permissions: [
    'read("user:applicant-1")',
    'update("user:applicant-1")',
    'delete("user:applicant-1")',
  ],
};
const APPLICATION_HAPPY_DBS = {
  listRows: async () => ({ rows: [] }),
  createRow: async ({ tableId }) => ({
    $id: tableId === 'tenants-1' ? 'tenant-new' : 'membership-new',
  }),
};
const APPLICATION_HAPPY_STORAGE = {
  getFile: async () => APPLICANT_FILE,
  updateFile: async () => ({}),
};

test(
  'submitTenantApplication rejects an unauthenticated caller with 401',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({ body: applicationBody(), getAccount: asApplicant });
    const result = await handleTenantMembershipRequest(ctx);
    assert.equal(result.status, 401);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'submitTenantApplication creates a pending Tenant and an active super_organizer Membership for the caller',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: applicationBody(),
      headers: APPLICANT_HEADERS,
      getAccount: asApplicant,
      databases: APPLICATION_HAPPY_DBS,
      storage: APPLICATION_HAPPY_STORAGE,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.tenantStatus, 'pending');
    const [[tenantArgs], [membershipArgs]] = calls.createRow;
    assert.equal(tenantArgs.tableId, 'tenants-1');
    assert.equal(tenantArgs.data.status, 'pending');
    assert.equal(tenantArgs.data.superOrganizerId, 'applicant-1');
    assert.equal(tenantArgs.data.verificationDocumentId, 'file-1');
    assert.equal(tenantArgs.data.verifiedBy, undefined);
    assert.deepEqual(tenantArgs.permissions, ['read("label:admin")', 'read("user:applicant-1")']);
    assert.equal(membershipArgs.tableId, 'memberships-1');
    assert.equal(membershipArgs.data.userId, 'applicant-1');
    assert.equal(membershipArgs.data.tenantId, 'tenant-new');
    assert.equal(membershipArgs.data.role, 'super_organizer');
    assert.equal(membershipArgs.data.status, 'active');
    const [[lockArgs]] = calls.updateFile;
    assert.deepEqual(lockArgs.permissions, ['read("label:admin")', 'read("user:applicant-1")']);
  }),
);

test(
  'submitTenantApplication refuses a caller who already holds any Membership (one Account per relationship)',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: applicationBody(),
      headers: APPLICANT_HEADERS,
      getAccount: asApplicant,
      databases: {
        ...APPLICATION_HAPPY_DBS,
        listRows: async () => ({
          rows: [{ $id: 'm-old', userId: 'applicant-1', status: 'revoked' }],
        }),
      },
      storage: APPLICATION_HAPPY_STORAGE,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(result.body.error, "We couldn't process this application");
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'submitTenantApplication refuses a caller who already holds a platform Label (Admin/Operator)',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: applicationBody(),
      headers: APPLICANT_HEADERS,
      getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
      databases: APPLICATION_HAPPY_DBS,
      storage: APPLICATION_HAPPY_STORAGE,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.createRow, undefined);
  }),
);

for (const smuggled of [{ status: 'approved' }, { role: 'operator' }, { superOrganizerId: 'x' }]) {
  test(
    `submitTenantApplication refuses client-supplied ${Object.keys(smuggled)[0]} (top-level and inside company)`,
    withEnv(async () => {
      for (const body of [
        applicationBody(smuggled),
        applicationBody({ company: { ...COMPANY, ...smuggled } }),
      ]) {
        const { ctx, calls } = fakeContext({
          body,
          headers: APPLICANT_HEADERS,
          getAccount: asApplicant,
          databases: APPLICATION_HAPPY_DBS,
          storage: APPLICATION_HAPPY_STORAGE,
        });
        const result = await handleTenantMembershipRequest(ctx);
        assert.equal(result.status, 400);
        assert.equal(calls.createRow, undefined);
      }
    }),
  );
}

test(
  'submitTenantApplication rejects an incomplete intake with 400 before any write',
  withEnv(async () => {
    const { estimatedUserCount: _omit, ...withoutCount } = COMPANY;
    for (const body of [
      applicationBody({ company: withoutCount }),
      applicationBody({ company: { ...COMPANY, location: '   ' } }),
      applicationBody({ company: { ...COMPANY, size: 'huge' } }),
      applicationBody({ verificationDocumentId: '' }),
      applicationBody({ company: 'not-an-object' }),
    ]) {
      const { ctx, calls } = fakeContext({
        body,
        headers: APPLICANT_HEADERS,
        getAccount: asApplicant,
        databases: APPLICATION_HAPPY_DBS,
        storage: APPLICATION_HAPPY_STORAGE,
      });
      const result = await handleTenantMembershipRequest(ctx);
      assert.equal(result.status, 400);
      assert.equal(calls.createRow, undefined);
    }
  }),
);

test(
  'submitTenantApplication refuses a document the caller did not upload',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: applicationBody(),
      headers: APPLICANT_HEADERS,
      getAccount: asApplicant,
      databases: APPLICATION_HAPPY_DBS,
      storage: {
        getFile: async () => ({ ...APPLICANT_FILE, $permissions: ['update("user:someone-else")'] }),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 400);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'submitTenantApplication rolls back the Tenant when the Membership write fails',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: applicationBody(),
      headers: APPLICANT_HEADERS,
      getAccount: asApplicant,
      databases: {
        ...APPLICATION_HAPPY_DBS,
        createRow: async ({ tableId }) => {
          if (tableId === 'tenants-1') return { $id: 'tenant-new' };
          throw new Error('boom');
        },
      },
      storage: APPLICATION_HAPPY_STORAGE,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 502);
    assert.deepEqual(calls.deleteRow[0][0], {
      databaseId: 'db-1',
      tableId: 'tenants-1',
      rowId: 'tenant-new',
    });
    assert.equal(calls.updateFile, undefined);
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
        }),
        updateRow: async () => ({}),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(calls.updateRow[0][0].data.status, 'approved');
  }),
);

const inviteBody = (overrides = {}) => ({
  action: 'inviteOrganizer',
  name: 'Kwame Asante',
  email: 'kwame@asante.example',
  company: COMPANY,
  ...overrides,
});

test(
  'inviteOrganizer rejects a non-admin caller with 403',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({ body: inviteBody(), ...asOperator });
    const result = await handleTenantMembershipRequest(ctx);
    assert.equal(result.status, 403);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  'inviteOrganizer creates an approved Tenant (verified by the Admin) and an active super_organizer Membership, then emails the invite',
  withEnv(async () => {
    const { ctx, calls, logs } = fakeContext({
      body: inviteBody(),
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: { usersCreate: async () => ({ $id: 'org-1' }) },
      databases: {
        createRow: async ({ tableId }) => ({
          $id: tableId === 'tenants-1' ? 'tenant-9' : 'membership-9',
        }),
      },
      messaging: { createEmail: async () => ({}) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.tenantStatus, 'approved');
    assert.deepEqual(result.body.inviteStatus, { email: 'sent' });
    const [[tenantArgs], [membershipArgs]] = calls.createRow;
    assert.equal(tenantArgs.data.status, 'approved');
    assert.equal(tenantArgs.data.superOrganizerId, 'org-1');
    assert.equal(tenantArgs.data.verifiedBy, 'admin-1');
    assert.ok(tenantArgs.data.verifiedAt);
    assert.equal(membershipArgs.data.userId, 'org-1');
    assert.equal(membershipArgs.data.tenantId, 'tenant-9');
    assert.equal(membershipArgs.data.role, 'super_organizer');
    assert.equal(membershipArgs.data.status, 'active');
    assert.deepEqual(calls.createEmail[0][0].users, ['org-1']);
    assert.ok(!logs.join('\n').includes(result.body.generatedPassword));
  }),
);

test(
  'inviteOrganizer returns 409 without writing anything when the email already has an Account',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: inviteBody(),
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: {
        usersCreate: async () => Promise.reject(Object.assign(new Error('dup'), { code: 409 })),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'inviteOrganizer deletes the new Account when the Tenant write fails',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: inviteBody(),
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: { usersCreate: async () => ({ $id: 'org-1' }) },
      databases: { createRow: async () => Promise.reject(new Error('boom')) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 502);
    assert.deepEqual(calls.usersDelete[0][0], { userId: 'org-1' });
    assert.equal(calls.createEmail, undefined);
  }),
);

test(
  'inviteOrganizer deletes the Tenant and the Account when the Membership write fails',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: inviteBody(),
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: { usersCreate: async () => ({ $id: 'org-1' }) },
      databases: {
        createRow: async ({ tableId }) => {
          if (tableId === 'tenants-1') return { $id: 'tenant-9' };
          throw new Error('boom');
        },
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 502);
    assert.equal(calls.deleteRow[0][0].rowId, 'tenant-9');
    assert.deepEqual(calls.usersDelete[0][0], { userId: 'org-1' });
    assert.equal(calls.createEmail, undefined);
  }),
);

test(
  'a pending applicant (no Label) is refused every Admin-gated tenant action with 403',
  withEnv(async () => {
    for (const body of [
      { action: 'addTeamMember', name: 'X', email: 'x@y.co', tenantId: 't1', role: 'operator' },
      { action: 'createMembership', userId: 'u2', tenantId: 't1', role: 'operator' },
      { action: 'setTenantStatus', tenantId: 't1', status: 'approved' },
      inviteBody(),
    ]) {
      const { ctx, calls } = fakeContext({
        body,
        headers: APPLICANT_HEADERS,
        getAccount: asApplicant,
      });
      const result = await handleTenantMembershipRequest(ctx);
      assert.equal(result.status, 403);
      assert.equal(calls.createRow, undefined);
      assert.equal(calls.updateRow, undefined);
    }
  }),
);
