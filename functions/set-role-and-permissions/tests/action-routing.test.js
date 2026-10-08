import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runActionHandler } from '../src/shared.js';
import * as adminUsers from '../src/admin-users.js';
import * as tenantMembership from '../src/tenant-membership.js';
import * as familyAccess from '../src/family-access.js';
import * as donationRecording from '../src/donation-recording.js';
import * as supportRequests from '../src/support-requests.js';
import * as supportInbox from '../src/support-inbox.js';
import { fakeContext, ADMIN_HEADERS, asAdmin } from './helpers/admin-users-fixtures.js';
import { withEnv, run } from './helpers/team-management-fixtures.js';
import * as family from './helpers/family-access-fixtures.js';

const MODULES = [
  ['admin-users', adminUsers.ADMIN_USER_ACTIONS, adminUsers.ACTION_HANDLERS],
  [
    'tenant-membership',
    tenantMembership.TENANT_MEMBERSHIP_ACTIONS,
    tenantMembership.ACTION_HANDLERS,
  ],
  ['family-access', familyAccess.FAMILY_ACCESS_ACTIONS, familyAccess.ACTION_HANDLERS],
  [
    'donation-recording',
    donationRecording.DONATION_RECORDING_ACTIONS,
    donationRecording.ACTION_HANDLERS,
  ],
  ['support-requests', supportRequests.SUPPORT_REQUEST_ACTIONS, supportRequests.ACTION_HANDLERS],
  ['support-inbox', supportInbox.SUPPORT_INBOX_ACTIONS, supportInbox.ACTION_HANDLERS],
];

for (const [moduleName, actions, handlers] of MODULES) {
  test(`every validated ${moduleName} action has a handler, and no handler is orphaned`, () => {
    for (const action of actions) {
      assert.equal(typeof handlers[action], 'function', `${moduleName}: ${action} is unrouted`);
    }
    assert.deepEqual(Object.keys(handlers).sort(), [...actions].sort());
  });
}

test('runActionHandler answers an unregistered action with a logged 500, not a TypeError', async () => {
  const errors = [];

  for (const action of ['nope', 'constructor', undefined]) {
    const result = await runActionHandler({
      handlers: {},
      action,
      context: {},
      error: (msg) => errors.push(msg),
    });

    assert.deepEqual(result, { status: 500, body: { error: 'Unrouted action' } });
  }
  assert.equal(errors.length, 3);
});

async function withoutHandler(handlers, action, fn) {
  const saved = handlers[action];
  delete handlers[action];
  try {
    return await fn();
  } finally {
    handlers[action] = saved;
  }
}

test('admin-users: a validated action missing its handler returns 500', async () => {
  const { ctx, errors } = fakeContext({
    body: { action: 'listUsers' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
  });

  const result = await withoutHandler(adminUsers.ACTION_HANDLERS, 'listUsers', () =>
    adminUsers.handleAdminUsersRequest(ctx),
  );

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Unrouted action' });
  assert.match(errors[0], /Unrouted action: listUsers/);
});

test(
  'tenant-membership: a validated action missing its handler returns 500',
  withEnv(async () => {
    const result = await withoutHandler(
      tenantMembership.ACTION_HANDLERS,
      'listIdentityReviews',
      async () => (await run({ body: { action: 'listIdentityReviews' }, as: 'admin-1' })).result,
    );

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: 'Unrouted action' });
  }),
);

test(
  'family-access: a validated action missing its handler returns 500',
  family.withEnv(async () => {
    const { ctx } = family.fakeContext({
      body: { action: 'resolveAccessCode', code: 'ABCD2345' },
      headers: family.PUBLIC_HEADERS,
      getAccount: asAdmin,
    });

    const result = await withoutHandler(familyAccess.ACTION_HANDLERS, 'resolveAccessCode', () =>
      familyAccess.handleFamilyAccessRequest(ctx),
    );

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: 'Unrouted action' });
  }),
);
