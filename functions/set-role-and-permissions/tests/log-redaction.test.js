import { test } from 'node:test';
import assert from 'node:assert/strict';
import main from '../src/main.js';
import { handleAdminUsersRequest } from '../src/admin-users.js';
import { loggableSummary } from '../src/log-summary.js';
import { fakeContext, ADMIN_HEADERS, asAdmin } from './helpers/admin-users-fixtures.js';
import { withEnv, add, run } from './helpers/team-management-fixtures.js';
import { FLAGGED_PERSON, identityStore, runSteps } from './helpers/identity-check-fixtures.js';
import { inboxContext, withInboxEnv } from './helpers/support-inbox-fixtures.js';

const PERSONAL_DETAILS = ['kojo@a.co', 'Kojo Mensah', 'kofi@givio.test', 'Kofi', 'asante.test'];

function assertNothingSensitiveLogged(logs, extra = []) {
  const logged = logs.join('\n');
  assert.ok(logged.length > 0, 'expected a success log');
  for (const secret of [...PERSONAL_DETAILS, ...extra]) {
    assert.ok(!logged.includes(secret), `log leaked ${secret}: ${logged}`);
  }
}

test('loggableSummary redacts secrets and personal fields, omits logos and counts arrays', () => {
  const summary = loggableSummary({
    success: true,
    generatedPassword: 'pw',
    apiToken: 't',
    clientSecret: 's',
    email: 'a@b.co',
    logo: 'data:image/png;base64,AAAA',
    members: [{ name: 'A' }, { name: 'B' }],
    tenant: { logo: 'data:x', phone: '+233', tenantId: 'tenant-a' },
  });

  assert.deepEqual(summary, {
    success: true,
    generatedPassword: '[redacted]',
    apiToken: '[redacted]',
    clientSecret: '[redacted]',
    email: '[redacted]',
    logo: '[omitted]',
    members: '[2 items]',
    tenant: { logo: '[omitted]', phone: '[redacted]', tenantId: 'tenant-a' },
  });
  assert.equal(loggableSummary([1, 2, 3]), '[3 items]');
});

test('createUser logs neither the generated password nor the new user email', async () => {
  const { ctx, logs, jsonCalls } = fakeContext({
    body: { action: 'createUser', name: 'Kofi', email: 'kofi@givio.test', role: 'operator' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: { create: () => ({ $id: 'new-2' }) },
  });

  await handleAdminUsersRequest(ctx);

  assertNothingSensitiveLogged(logs, [jsonCalls[0].body.generatedPassword]);
  assert.match(logs.join(''), /new-2/);
});

test('listUsers logs a count, never the user list', async () => {
  const { ctx, logs } = fakeContext({
    body: { action: 'listUsers' },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: {
      list: () => ({
        users: [{ $id: 'u2', name: 'Kofi', email: 'kofi@givio.test', labels: [], status: true }],
      }),
    },
  });

  await handleAdminUsersRequest(ctx);

  assertNothingSensitiveLogged(logs);
  assert.match(logs.join(''), /\[1 items\]/);
});

test(
  'addTeamMember logs neither the generated password nor the new member details',
  withEnv(async () => {
    const { result, logs } = await run({ body: add('operator'), as: 'so-a' });

    assert.equal(result.status, 200);
    assertNothingSensitiveLogged(logs, [result.body.generatedPassword]);
  }),
);

test(
  'listTeamMembers logs a count, never the roster',
  withEnv(async () => {
    const { result, logs } = await run({ body: { action: 'listTeamMembers' }, as: 'org-a' });

    assert.equal(result.status, 200);
    assertNothingSensitiveLogged(logs, ['Yaw Asante', 'yaw@a.co', 'Kwesi Boateng', 'kwesi@a.co']);
    assert.match(logs.join(''), /\[\d+ items\]/);
  }),
);

test(
  'listIdentityReviews logs a count, never the flagged names, emails or phones',
  withEnv(async () => {
    const store = identityStore([FLAGGED_PERSON]);
    const steps = [
      { body: add('operator'), as: 'so-a' },
      { body: { action: 'listIdentityReviews' }, as: 'admin-1' },
    ];
    const [, listed] = await runSteps({ store, steps });

    assert.equal(listed.result.status, 200);
    assertNothingSensitiveLogged(listed.logs, [FLAGGED_PERSON.phone, 'kojo.old@x.co']);
    assert.match(listed.logs.join(''), /\[1 items\]/);
  }),
);

test(
  'listSupportRequests logs no requester email, name or message',
  withInboxEnv(async () => {
    const { ctx, logs } = inboxContext({
      body: { action: 'listSupportRequests' },
      tables: {
        listRows: () => ({
          rows: [
            {
              $id: 'r1',
              $createdAt: '2026-09-30T10:00:00.000Z',
              type: 'question',
              status: 'open',
              contactEmail: 'kwame@asante.test',
              message: 'Kofi cannot sign in',
            },
          ],
        }),
      },
    });

    await main(ctx);

    assertNothingSensitiveLogged(logs, ['Kofi cannot sign in']);
  }),
);
