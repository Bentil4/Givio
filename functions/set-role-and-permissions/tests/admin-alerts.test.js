import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notifyAdmins, ADMIN_ALERT_MAX_RECIPIENTS } from '../src/admin-alerts.js';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import { handleTenantGrantsRequest } from '../src/tenant-grants.js';
import {
  withEnv,
  inMemoryStore,
  invoke,
  tenantFixture,
} from './helpers/tenant-read-grants-fixtures.js';

const ADMINS = [
  { $id: 'a1', status: true, labels: ['admin'] },
  { $id: 'a2', status: false, labels: ['admin'] },
  { $id: 'o1', status: true, labels: ['operator'] },
];

function alertFakes({ users = ADMINS, sendEmail } = {}) {
  const sent = [];
  const listed = [];
  const errors = [];
  class UsersCtor {
    async list(args) {
      listed.push(args);
      return { users };
    }
    async get({ userId }) {
      return { $id: userId, labels: ['operator'] };
    }
    async create({ userId }) {
      return { $id: userId };
    }
    async updateStatus() {}
    async deleteSessions() {}
  }
  class MessagingCtor {
    async createEmail(args) {
      sent.push(args);
      return sendEmail ? sendEmail(args) : {};
    }
  }
  return { sent, listed, errors, UsersCtor, MessagingCtor };
}

async function withAppUrl(fn) {
  process.env.APP_URL = 'https://givio.test/';
  try {
    await fn();
  } finally {
    delete process.env.APP_URL;
  }
}

test('notifyAdmins emails active Admins only, as plain text with a link', () =>
  withAppUrl(async () => {
    const fakes = alertFakes();

    await notifyAdmins({
      adminClient: {},
      subject: 'Subject',
      text: 'Body',
      linkPath: '/dashboard/companies',
      error: (m) => fakes.errors.push(m),
      UsersCtor: fakes.UsersCtor,
      MessagingCtor: fakes.MessagingCtor,
    });

    assert.equal(fakes.sent.length, 1);
    assert.deepEqual(fakes.sent[0].users, ['a1']);
    assert.equal(fakes.sent[0].subject, 'Subject');
    assert.equal(fakes.sent[0].html, false);
    assert.equal(fakes.sent[0].content, 'Body\n\nhttps://givio.test/dashboard/companies');
    assert.deepEqual(fakes.errors, []);
  }));

test('notifyAdmins asks for at most the recipient cap', () =>
  withAppUrl(async () => {
    const fakes = alertFakes();

    await notifyAdmins({
      adminClient: {},
      subject: 'S',
      text: 'B',
      linkPath: '/x',
      error: () => {},
      UsersCtor: fakes.UsersCtor,
      MessagingCtor: fakes.MessagingCtor,
    });

    assert.ok(String(fakes.listed[0].queries[1]).includes(String(ADMIN_ALERT_MAX_RECIPIENTS)));
  }));

test('notifyAdmins sends nothing without an active Admin and never throws on failures', async () => {
  const quiet = alertFakes({ users: [] });
  const broken = alertFakes({ sendEmail: () => Promise.reject(new Error('smtp down')) });
  const options = { adminClient: {}, subject: 'S', text: 'B', linkPath: '/x' };

  await notifyAdmins({ ...options, error: () => {}, ...quiet });
  await notifyAdmins({ ...options, error: (m) => broken.errors.push(m), ...broken });

  assert.equal(quiet.sent.length, 0);
  assert.match(broken.errors.at(-1), /Admin alert email failed: smtp down/);
});

test('notifyAdmins without APP_URL omits the link', async () => {
  const fakes = alertFakes();

  await notifyAdmins({
    adminClient: {},
    subject: 'S',
    text: 'Body',
    linkPath: '/x',
    error: () => {},
    ...fakes,
  });

  assert.equal(fakes.sent[0].content, 'Body');
});

const failingDonations = { failUpdate: ({ tableId }) => tableId === 'donations-1' };

function failingSweepStore(options = {}) {
  const { tables } = tenantFixture(options);
  return inMemoryStore(tables, failingDonations);
}

function runMembershipAction(store, body, fakes) {
  return invoke(handleTenantMembershipRequest, store, body, undefined, undefined, {
    UsersCtor: fakes.UsersCtor,
    MessagingCtor: fakes.MessagingCtor,
  });
}

function assertSweepAlert(fakes) {
  assert.equal(fakes.sent.length, 1);
  assert.deepEqual(fakes.sent[0].users, ['a1']);
  assert.equal(fakes.sent[0].subject, 'Permission sweep failed for Kente Events');
  assert.match(fakes.sent[0].content, /Tenant: Kente Events \(t1\)/);
  assert.match(fakes.sent[0].content, /Failed rows: [1-9]/);
  assert.match(fakes.sent[0].content, /Timed out: no/);
  assert.match(fakes.sent[0].content, /\nhttps:\/\/givio\.test\/dashboard\/companies$/);
}

test(
  'a failed sweep after approving a tenant emails the Admins and still answers 502',
  withEnv(() =>
    withAppUrl(async () => {
      const fakes = alertFakes();
      const store = failingSweepStore({ tenantStatus: 'pending' });

      const result = await runMembershipAction(
        store,
        { action: 'setTenantStatus', tenantId: 't1', status: 'approved' },
        fakes,
      );

      assert.equal(result.status, 502);
      assertSweepAlert(fakes);
    }),
  ),
);

test(
  'a failed sweep after suspending a tenant emails the Admins',
  withEnv(() =>
    withAppUrl(async () => {
      const fakes = alertFakes();
      const store = failingSweepStore();

      const result = await runMembershipAction(
        store,
        { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
        fakes,
      );

      assert.equal(result.status, 502);
      assertSweepAlert(fakes);
    }),
  ),
);

test(
  'a failed sweep after adding a member emails the Admins',
  withEnv(() =>
    withAppUrl(async () => {
      const fakes = alertFakes();
      const store = failingSweepStore();

      const result = await runMembershipAction(
        store,
        { action: 'createMembership', userId: 'org-9', tenantId: 't1', role: 'organizer' },
        fakes,
      );

      assert.equal(result.status, 502);
      assertSweepAlert(fakes);
    }),
  ),
);

test(
  'a failed sweep while revoking a member emails the Admins',
  withEnv(() =>
    withAppUrl(async () => {
      const fakes = alertFakes();
      const store = failingSweepStore();

      const result = await runMembershipAction(
        store,
        { action: 'revokeMembership', reason: 'routine', membershipId: 'm-co' },
        fakes,
      );

      assert.equal(result.status, 502);
      assertSweepAlert(fakes);
    }),
  ),
);

test(
  'a successful sweep sends no alert',
  withEnv(() =>
    withAppUrl(async () => {
      const fakes = alertFakes();

      const result = await runMembershipAction(
        tenantFixture(),
        { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
        fakes,
      );

      assert.equal(result.status, 200);
      assert.equal(fakes.sent.length, 0);
    }),
  ),
);

test(
  'a failing alert email never changes the 502 answer',
  withEnv(() =>
    withAppUrl(async () => {
      const fakes = alertFakes({ sendEmail: () => Promise.reject(new Error('smtp down')) });

      const result = await runMembershipAction(
        failingSweepStore(),
        { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
        fakes,
      );

      assert.equal(result.status, 502);
    }),
  ),
);

test(
  'the explicit Admin backfill never emails: the Admin is already looking at the result',
  withEnv(() =>
    withAppUrl(async () => {
      const fakes = alertFakes();
      const store = failingSweepStore();

      const result = await invoke(
        handleTenantGrantsRequest,
        store,
        { action: 'recomputeTenantReadGrants', tenantId: 't1' },
        undefined,
        undefined,
        { UsersCtor: fakes.UsersCtor, MessagingCtor: fakes.MessagingCtor },
      );

      assert.equal(result.status, 502);
      assert.equal(fakes.sent.length, 0);
    }),
  ),
);
