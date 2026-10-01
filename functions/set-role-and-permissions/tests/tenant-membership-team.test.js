import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import {
  fakeContext,
  ADMIN_HEADERS,
  asAdmin,
  asOperator,
  withEnv,
} from './helpers/tenant-membership-fixtures.js';

test(
  'revokeMembership rejects a verified non-admin caller with 403',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'membership-1' },
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
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'membership-1' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async ({ tableId }) =>
          tableId === 'tenants-1'
            ? { $id: 't1', status: 'approved' }
            : { $id: 'membership-1', userId: 'u1', tenantId: 't1' },
        updateRow: async () => ({}),
        listRows: async ({ tableId }) => {
          if (tableId === 'memberships-1') {
            return { rows: [{ userId: 'u2', tenantId: 't1', role: 'operator', status: 'active' }] };
          }
          if (tableId === 'events-1') {
            return { rows: [{ $id: 'event-1', tenantId: 't1', assignedUserIds: ['u1', 'u2'] }] };
          }
          return { rows: [] };
        },
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
    // The sweep's Event listing is scoped to this membership's own tenant, not a blanket query
    // (AD-2 amended 2026-09-30: every tenant Event is re-derived, since an organizer-tier uid
    // is granted on Events it isn't assigned to).
    const [listArgs] = calls.listRows.find(([args]) => args.tableId === 'events-1');
    assert.deepEqual(listArgs.queries.slice(0, 1), [
      JSON.stringify({ method: 'equal', attribute: 'tenantId', values: ['t1'] }),
    ]);
  }),
);

test(
  "revokeMembership returns 502 (not a false 200) when the sweep's Event lookup fails",
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'membership-1' },
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
        listRows: async () => ({ rows: [] }),
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
        listRows: async () => ({ rows: [] }),
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
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'membership-a' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async ({ rowId }) => membershipsById[rowId] ?? { $id: rowId, status: 'approved' },
        updateRow: async () => ({}),
        listRows: async ({ tableId, queries }) => {
          if (tableId !== 'events-1') return { rows: [] };
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
