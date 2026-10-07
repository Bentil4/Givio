import { test } from 'node:test';
import assert from 'node:assert/strict';
import main from '../src/main.js';
import {
  DISPUTE_EMAIL_EXCERPT_MAX,
  DISPUTE_EMAIL_MAX_RECIPIENTS,
} from '../src/dispute-notification.js';
import { FakeClient } from './helpers/support-inbox-fixtures.js';

const PUBLIC_HEADERS = { 'x-appwrite-key': 'dynamic-key' };
const USER_HEADERS = { ...PUBLIC_HEADERS, 'x-appwrite-user-jwt': 'jwt' };
const ENV_NAMES = [
  'APPWRITE_DATABASE_ID',
  'APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID',
  'APPWRITE_MEMBERSHIPS_COLLECTION_ID',
  'APP_URL',
];

function withNotifyEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID = 'support-1';
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID = 'memberships-1';
    process.env.APP_URL = 'https://givio.test/';
    try {
      await fn();
    } finally {
      ENV_NAMES.forEach((name) => delete process.env[name]);
    }
  };
}

function submissionContext({ body, headers = PUBLIC_HEADERS, users, sendEmail, rows = [] }) {
  const sent = [];
  const errors = [];
  const usersListed = [];
  class TablesDBCtor {
    async listRows({ tableId }) {
      return { rows: tableId === 'memberships-1' ? rows : [] };
    }
    async createRow(args) {
      return { $id: 'sr-1', ...args.data };
    }
  }
  class UsersCtor {
    async list(args) {
      usersListed.push(args);
      return users();
    }
  }
  class MessagingCtor {
    async createEmail(args) {
      sent.push(args);
      return sendEmail ? sendEmail(args) : {};
    }
  }
  class AccountCtor {
    async get() {
      return { $id: 'org-1', email: 'k@asante.test', labels: [] };
    }
  }
  return {
    ctx: {
      req: { bodyRaw: JSON.stringify(body), headers },
      res: { json: (responseBody, status = 200) => ({ body: responseBody, status }) },
      log: () => {},
      error: (msg) => errors.push(msg),
      ClientCtor: FakeClient,
      AccountCtor,
      TablesDBCtor,
      UsersCtor,
      MessagingCtor,
      now: () => new Date('2026-09-30T12:00:00.000Z'),
    },
    sent,
    errors,
    usersListed,
  };
}

const DISPUTE = {
  action: 'submitDispute',
  email: 'kwame@asante.test',
  tenantName: 'Asante Events',
  message: 'We were suspended by mistake.',
};
const USERS = () => ({
  users: [
    { $id: 'a1', status: true, labels: ['admin'] },
    { $id: 'a2', status: false, labels: ['admin'] },
    { $id: 'o1', status: true, labels: ['operator'] },
  ],
});

test(
  'a stored dispute emails active Admins only, in plain text with a link to the inbox',
  withNotifyEnv(async () => {
    const { ctx, sent, usersListed } = submissionContext({ body: DISPUTE, users: USERS });
    const result = await main(ctx);
    assert.equal(result.status, 200);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].users, ['a1']);
    assert.equal(sent[0].html, false);
    assert.match(sent[0].content, /A company has submitted a dispute: Asante Events — kwame@/);
    assert.match(sent[0].content, /\nhttps:\/\/givio\.test\/dashboard\/support$/);
    assert.ok(String(usersListed[0].queries[1]).includes(String(DISPUTE_EMAIL_MAX_RECIPIENTS)));
  }),
);

test(
  'the emailed message is cut to its first 300 characters',
  withNotifyEnv(async () => {
    const long = 'x'.repeat(DISPUTE_EMAIL_EXCERPT_MAX + 50);
    const { ctx, sent } = submissionContext({ body: { ...DISPUTE, message: long }, users: USERS });
    await main(ctx);
    const excerpt = sent[0].content.split('\n')[2];
    assert.equal(excerpt, `${'x'.repeat(DISPUTE_EMAIL_EXCERPT_MAX)}…`);
  }),
);

test(
  'a failing email or admin lookup never fails the dispute submission',
  withNotifyEnv(async () => {
    const failures = [
      { users: USERS, sendEmail: () => Promise.reject(new Error('smtp down')) },
      {
        users: () => {
          throw new Error('users down');
        },
      },
    ];
    for (const failure of failures) {
      const { ctx, errors } = submissionContext({ body: DISPUTE, ...failure });
      const result = await main(ctx);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { success: true });
      assert.match(errors[0], /Dispute notification email failed/);
    }
  }),
);

test(
  'no email goes out when there is no active Admin',
  withNotifyEnv(async () => {
    const { ctx, sent } = submissionContext({ body: DISPUTE, users: () => ({ users: [] }) });
    assert.equal((await main(ctx)).status, 200);
    assert.equal(sent.length, 0);
  }),
);

test(
  'a question sends no email',
  withNotifyEnv(async () => {
    const { ctx, sent, usersListed } = submissionContext({
      body: { action: 'submitSupportRequest', message: 'Hi' },
      headers: USER_HEADERS,
      users: USERS,
      rows: [{ $id: 'm1', userId: 'org-1', tenantId: 't1', role: 'organizer', status: 'active' }],
    });
    assert.equal((await main(ctx)).status, 200);
    assert.equal(sent.length, 0);
    assert.equal(usersListed.length, 0);
  }),
);
