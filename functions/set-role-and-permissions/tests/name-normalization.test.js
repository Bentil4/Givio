import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminUsersRequest } from '../src/admin-users.js';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import { normalizeEmail, normalizeName } from '../src/shared.js';
import { fakeContext, ADMIN_HEADERS, asAdmin } from './helpers/admin-users-fixtures.js';
import { withEnv, add, run } from './helpers/team-management-fixtures.js';
import * as membership from './helpers/tenant-membership-fixtures.js';

const MESSY = { name: '  Ama \t  Owusu ', email: '  ama@a.co  ' };

test('normalizeName trims and collapses internal whitespace; normalizeEmail trims', () => {
  assert.equal(normalizeName('  Ama \n  Owusu '), 'Ama Owusu');
  assert.equal(normalizeEmail('  ama@a.co '), 'ama@a.co');
});

test('createUser creates the Account with the normalized name and email', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'createUser', ...MESSY, role: 'operator' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: { create: () => ({ $id: 'new-1' }) },
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 200);
  assert.equal(calls.create[0][0].name, 'Ama Owusu');
  assert.equal(calls.create[0][0].email, 'ama@a.co');
});

test('createUser rejects a whitespace-only name with 400 before creating anything', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'createUser', name: '   ', email: 'a@a.co', role: 'operator' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await handleAdminUsersRequest(ctx);

  assert.equal(result.status, 400);
  assert.equal(calls.create, undefined);
});

test(
  'addTeamMember creates the Account with the normalized name and email',
  withEnv(async () => {
    const { result, calls } = await run({ body: add('operator', MESSY), as: 'so-a' });

    assert.equal(result.status, 200);
    assert.equal(calls.usersCreate[0][0].name, 'Ama Owusu');
    assert.equal(calls.usersCreate[0][0].email, 'ama@a.co');
    assert.equal(result.body.name, 'Ama Owusu');
  }),
);

test(
  'addTeamMember rejects a whitespace-only name with 400 before creating an Account',
  withEnv(async () => {
    const { result, calls } = await run({ body: add('operator', { name: ' \t ' }), as: 'so-a' });

    assert.equal(result.status, 400);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  'inviteOrganizer creates the Account with the normalized name and email',
  withEnv(async () => {
    const { ctx, calls } = membership.fakeContext({
      body: membership.inviteBody(MESSY),
      headers: membership.ADMIN_HEADERS,
      getAccount: membership.asAdmin,
      users: { usersCreate: async () => ({ $id: 'org-1' }) },
      databases: { createRow: async () => ({ $id: 'row-1' }) },
      messaging: { createEmail: async () => ({}) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(calls.usersCreate[0][0].name, 'Ama Owusu');
    assert.equal(calls.usersCreate[0][0].email, 'ama@a.co');
  }),
);

test(
  'inviteOrganizer rejects a whitespace-only name with 400 before creating an Account',
  withEnv(async () => {
    const { ctx, calls } = membership.fakeContext({
      body: membership.inviteBody({ name: '   ' }),
      headers: membership.ADMIN_HEADERS,
      getAccount: membership.asAdmin,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 400);
    assert.equal(calls.usersCreate, undefined);
  }),
);
