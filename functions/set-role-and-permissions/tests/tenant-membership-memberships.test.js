import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import {
  fakeContext,
  ADMIN_HEADERS,
  asAdmin,
  CREATE_MEMBERSHIP_HAPPY_PATH_DBS,
  CREATE_MEMBERSHIP_HAPPY_PATH_USERS,
  withEnv,
} from './helpers/tenant-membership-fixtures.js';

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
