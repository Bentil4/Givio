import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import {
  fakeContext,
  ADMIN_HEADERS,
  asAdmin,
  withEnv,
} from './helpers/tenant-membership-fixtures.js';

function addTeamMemberContext({ messaging, role = 'operator' }) {
  return fakeContext({
    body: {
      action: 'addTeamMember',
      name: 'Kwesi Boateng',
      email: 'kwesi@example.com',
      tenantId: 't1',
      role,
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    databases: {
      getRow: async () => ({ $id: 't1', status: 'approved' }),
      createRow: async () => ({ $id: 'membership-new' }),
      listRows: async () => ({ rows: [] }),
    },
    users: { usersCreate: async () => ({ $id: 'account-new' }) },
    messaging,
  });
}

test(
  'addTeamMember emails the new member their credentials and reports it as sent',
  withEnv(async () => {
    const { ctx, calls } = addTeamMemberContext({ messaging: { createEmail: async () => ({}) } });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.inviteStatus, { email: 'sent' });
    assert.ok(result.body.generatedPassword);
    const [email] = calls.createEmail[0];
    assert.deepEqual(email.users, ['account-new']);
    assert.equal(email.subject, 'Your Givio Operator account');
  }),
);

test(
  'addTeamMember labels an organizer-tier invite as Organizer',
  withEnv(async () => {
    const { ctx, calls } = addTeamMemberContext({
      messaging: { createEmail: async () => ({}) },
      role: 'organizer',
    });

    await handleTenantMembershipRequest(ctx);

    assert.equal(calls.createEmail[0][0].subject, 'Your Givio Organizer account');
  }),
);

test(
  'addTeamMember still succeeds, and reports failed delivery, when the invite email fails',
  withEnv(async () => {
    const { ctx } = addTeamMemberContext({
      messaging: { createEmail: async () => Promise.reject(new Error('no provider')) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.inviteStatus, { email: 'failed' });
    assert.ok(result.body.generatedPassword);
    assert.equal(result.body.userId, 'account-new');
  }),
);
