import { test } from 'node:test';
import assert from 'node:assert/strict';
import main from '../src/main.js';
import {
  handleSupportRequestsRequest,
  DISPUTE_LIMIT_GLOBAL_PER_HOUR,
  DISPUTE_LIMIT_PER_EMAIL_PER_DAY,
  QUESTION_LIMIT_PER_HOUR,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_TENANT_NAME_MAX,
} from '../src/support-requests.js';

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

const NOW = new Date('2026-09-30T12:00:00.000Z');

function fakeContext({ body, bodyRaw, headers = {}, getAccount, tablesDB = {} }) {
  const logs = [];
  const errors = [];
  const calls = { listRows: [], createRow: [] };

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }

  class TablesDBCtor {
    async listRows(args) {
      calls.listRows.push(args);
      return tablesDB.listRows ? tablesDB.listRows(args) : { rows: [] };
    }
    async createRow(args) {
      calls.createRow.push(args);
      return tablesDB.createRow ? tablesDB.createRow(args) : { $id: 'sr-1', ...args.data };
    }
  }

  const res = {
    json(responseBody, status = 200) {
      return { body: responseBody, status };
    },
  };

  return {
    ctx: {
      req: { bodyRaw: bodyRaw ?? JSON.stringify(body), headers },
      res,
      log: (msg) => logs.push(msg),
      error: (msg) => errors.push(msg),
      ClientCtor: FakeClient,
      AccountCtor,
      TablesDBCtor,
      now: () => NOW,
    },
    logs,
    errors,
    calls,
  };
}

const USER_HEADERS = { 'x-appwrite-user-jwt': 'user-jwt', 'x-appwrite-key': 'dynamic-key' };
const PUBLIC_HEADERS = { 'x-appwrite-key': 'dynamic-key' };
const asOrganizer = async () => ({ $id: 'org-1', email: 'kwame@asante.test', labels: [] });
const unreachableAccount = async () => {
  throw new Error('must not verify a caller for a public action');
};

function membershipRows(membership) {
  return (args) =>
    args.tableId === 'memberships-1' ? { rows: membership ? [membership] : [] } : { rows: [] };
}

const ACTIVE_ORGANIZER = {
  $id: 'm1',
  userId: 'org-1',
  tenantId: 't1',
  role: 'organizer',
  status: 'active',
};

function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID = 'support-1';
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID = 'memberships-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID;
      delete process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
    }
  };
}

const VALID_DISPUTE = {
  action: 'submitDispute',
  email: 'Kwame@Asante.test ',
  tenantName: '  Asante Events ',
  message: 'We were suspended by mistake.',
};

// ── submitSupportRequest ─────────────────────────────────────────────────────

test('submitSupportRequest requires a signed-in caller', async () => {
  const { ctx, calls } = fakeContext({
    body: { action: 'submitSupportRequest', message: 'Hi' },
    headers: PUBLIC_HEADERS,
    getAccount: asOrganizer,
  });
  const result = await handleSupportRequestsRequest(ctx);
  assert.equal(result.status, 401);
  assert.equal(calls.createRow.length, 0);
});

test(
  "submitSupportRequest stores the row against the caller's own Membership, ignoring any client-sent tenantId/userId",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: {
        action: 'submitSupportRequest',
        message: '  Where do I see last month’s totals?  ',
        tenantId: 'someone-elses-tenant',
        userId: 'someone-else',
        type: 'dispute',
        status: 'resolved',
      },
      headers: USER_HEADERS,
      getAccount: asOrganizer,
      tablesDB: { listRows: membershipRows(ACTIVE_ORGANIZER) },
    });
    const result = await handleSupportRequestsRequest(ctx);

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { success: true });
    assert.equal(calls.createRow.length, 1);
    const [row] = calls.createRow;
    assert.equal(row.tableId, 'support-1');
    assert.deepEqual(row.data, {
      type: 'question',
      tenantId: 't1',
      userId: 'org-1',
      contactEmail: 'kwame@asante.test',
      tenantName: null,
      message: 'Where do I see last month’s totals?',
      createdAt: NOW.toISOString(),
      status: 'open',
    });
    assert.deepEqual(row.permissions, ['read("label:admin")']);
  }),
);

for (const tenantState of ['pending', 'rejected', 'suspended']) {
  test(
    `submitSupportRequest never checks tenant status, so a ${tenantState} tenant can still reach Admin`,
    withEnv(async () => {
      const { ctx, calls } = fakeContext({
        body: { action: 'submitSupportRequest', message: 'Help' },
        headers: USER_HEADERS,
        getAccount: asOrganizer,
        tablesDB: { listRows: membershipRows({ ...ACTIVE_ORGANIZER, role: 'super_organizer' }) },
      });
      const result = await handleSupportRequestsRequest(ctx);
      assert.equal(result.status, 200);
      assert.ok(calls.listRows.every((q) => q.tableId !== 'tenants-1'));
    }),
  );
}

for (const [label, membership] of [
  ['no Membership', null],
  ['a revoked Membership', { ...ACTIVE_ORGANIZER, status: 'revoked' }],
  ['an Operator Membership', { ...ACTIVE_ORGANIZER, role: 'operator' }],
]) {
  test(
    `submitSupportRequest refuses a caller with ${label}`,
    withEnv(async () => {
      const { ctx, calls } = fakeContext({
        body: { action: 'submitSupportRequest', message: 'Help' },
        headers: USER_HEADERS,
        getAccount: asOrganizer,
        tablesDB: { listRows: membershipRows(membership) },
      });
      const result = await handleSupportRequestsRequest(ctx);
      assert.equal(result.status, 403);
      assert.equal(calls.createRow.length, 0);
    }),
  );
}

for (const [label, message] of [
  ['a missing message', undefined],
  ['a whitespace-only message', '   '],
  ['a non-string message', 42],
  ['an over-long message', 'x'.repeat(SUPPORT_MESSAGE_MAX + 1)],
]) {
  test(
    `submitSupportRequest rejects ${label} with 400`,
    withEnv(async () => {
      const { ctx, calls } = fakeContext({
        body: { action: 'submitSupportRequest', message },
        headers: USER_HEADERS,
        getAccount: asOrganizer,
        tablesDB: { listRows: membershipRows(ACTIVE_ORGANIZER) },
      });
      const result = await handleSupportRequestsRequest(ctx);
      assert.equal(result.status, 400);
      assert.equal(calls.createRow.length, 0);
    }),
  );
}

test(
  'submitSupportRequest answers 429 once the caller has hit the hourly cap',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'submitSupportRequest', message: 'Again' },
      headers: USER_HEADERS,
      getAccount: asOrganizer,
      tablesDB: {
        listRows: (args) =>
          args.tableId === 'memberships-1'
            ? { rows: [ACTIVE_ORGANIZER] }
            : {
                rows: Array.from({ length: QUESTION_LIMIT_PER_HOUR }, (_, i) => ({ $id: `r${i}` })),
              },
      },
    });
    const result = await handleSupportRequestsRequest(ctx);
    assert.equal(result.status, 429);
    assert.equal(calls.createRow.length, 0);
    const rateQuery = calls.listRows.find((q) => q.tableId === 'support-1');
    assert.ok(rateQuery.queries.some((q) => q.includes('org-1')));
  }),
);

test(
  'submitSupportRequest reports a failed write as 502 so the client keeps the text and can retry',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'submitSupportRequest', message: 'Help' },
      headers: USER_HEADERS,
      getAccount: asOrganizer,
      tablesDB: {
        listRows: membershipRows(ACTIVE_ORGANIZER),
        createRow: () => {
          throw new Error('db down');
        },
      },
    });
    const result = await handleSupportRequestsRequest(ctx);
    assert.equal(result.status, 502);
  }),
);

test(
  'submitSupportRequest fails closed with 502 when the Membership lookup fails',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'submitSupportRequest', message: 'Help' },
      headers: USER_HEADERS,
      getAccount: asOrganizer,
      tablesDB: {
        listRows: () => {
          throw new Error('db down');
        },
      },
    });
    const result = await handleSupportRequestsRequest(ctx);
    assert.equal(result.status, 502);
    assert.equal(calls.createRow.length, 0);
  }),
);

// ── submitDispute ────────────────────────────────────────────────────────────

test(
  'submitDispute runs with no JWT and stores a distinguishable dispute row with normalized identity',
  withEnv(async () => {
    const { ctx, calls, logs } = fakeContext({
      body: { ...VALID_DISPUTE, tenantId: 't-forged', userId: 'u-forged', status: 'resolved' },
      headers: PUBLIC_HEADERS,
      getAccount: unreachableAccount,
    });
    const result = await handleSupportRequestsRequest(ctx);

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { success: true });
    assert.equal(calls.createRow.length, 1);
    const [row] = calls.createRow;
    assert.deepEqual(row.data, {
      type: 'dispute',
      tenantId: null,
      userId: null,
      contactEmail: 'kwame@asante.test',
      tenantName: 'Asante Events',
      message: 'We were suspended by mistake.',
      createdAt: NOW.toISOString(),
      status: 'open',
    });
    assert.deepEqual(row.permissions, ['read("label:admin")']);
    assert.ok(logs.some((l) => l.includes('unauthenticated')));
  }),
);

test(
  'submitDispute never reads Tenants or Memberships, so its answer cannot reveal whether an account exists',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: VALID_DISPUTE,
      headers: PUBLIC_HEADERS,
      getAccount: unreachableAccount,
    });
    await handleSupportRequestsRequest(ctx);
    assert.ok(calls.listRows.every((q) => q.tableId === 'support-1'));
  }),
);

for (const [label, overrides] of [
  ['a malformed email', { email: 'not-an-email' }],
  ['an email with no dot in the domain', { email: 'a@b' }],
  ['an over-long email', { email: `${'a'.repeat(250)}@b.co` }],
  ['a non-string email', { email: ['a@b.co'] }],
  ['a missing tenant name', { tenantName: '' }],
  ['an over-long tenant name', { tenantName: 'x'.repeat(SUPPORT_TENANT_NAME_MAX + 1) }],
  ['a missing message', { message: '  ' }],
  ['an over-long message', { message: 'x'.repeat(SUPPORT_MESSAGE_MAX + 1) }],
]) {
  test(
    `submitDispute rejects ${label} with 400 before touching the database`,
    withEnv(async () => {
      const { ctx, calls } = fakeContext({
        body: { ...VALID_DISPUTE, ...overrides },
        headers: PUBLIC_HEADERS,
        getAccount: unreachableAccount,
      });
      const result = await handleSupportRequestsRequest(ctx);
      assert.equal(result.status, 400);
      assert.equal(calls.listRows.length, 0);
      assert.equal(calls.createRow.length, 0);
    }),
  );
}

test('submitDispute email validation stays linear-time on a dot-heavy domain', () => {
  const hostile = `a@${'.'.repeat(5000)}`;
  const { ctx } = fakeContext({
    body: { ...VALID_DISPUTE, email: hostile },
    headers: PUBLIC_HEADERS,
    getAccount: unreachableAccount,
  });
  const started = process.hrtime.bigint();
  return handleSupportRequestsRequest(ctx).then((result) => {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(result.status, 400);
    assert.ok(elapsedMs < 50, `validation took ${elapsedMs}ms`);
  });
});

test('submitDispute rejects an oversized body with 413 before parsing it', async () => {
  const { ctx, calls } = fakeContext({
    bodyRaw: JSON.stringify({ ...VALID_DISPUTE, padding: 'x'.repeat(10000) }),
    headers: PUBLIC_HEADERS,
    getAccount: unreachableAccount,
  });
  const result = await handleSupportRequestsRequest(ctx);
  assert.equal(result.status, 413);
  assert.equal(calls.listRows.length, 0);
});

test(
  'submitDispute silently drops a repeat past the per-email daily cap with the same success body',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: VALID_DISPUTE,
      headers: PUBLIC_HEADERS,
      getAccount: unreachableAccount,
      tablesDB: {
        listRows: (args) =>
          args.queries.some((q) => q.includes('contactEmail'))
            ? {
                rows: Array.from({ length: DISPUTE_LIMIT_PER_EMAIL_PER_DAY }, (_, i) => ({
                  $id: `r${i}`,
                })),
              }
            : { rows: [] },
      },
    });
    const result = await handleSupportRequestsRequest(ctx);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { success: true });
    assert.equal(calls.createRow.length, 0);
    const emailQuery = calls.listRows.find((q) =>
      q.queries.some((s) => s.includes('contactEmail')),
    );
    assert.ok(emailQuery.queries.some((s) => s.includes('kwame@asante.test')));
  }),
);

test(
  'submitDispute answers 429 once the global hourly dispute cap is reached',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: VALID_DISPUTE,
      headers: PUBLIC_HEADERS,
      getAccount: unreachableAccount,
      tablesDB: {
        listRows: () => ({
          rows: Array.from({ length: DISPUTE_LIMIT_GLOBAL_PER_HOUR }, (_, i) => ({ $id: `r${i}` })),
        }),
      },
    });
    const result = await handleSupportRequestsRequest(ctx);
    assert.equal(result.status, 429);
    assert.equal(calls.createRow.length, 0);
  }),
);

test(
  'submitDispute fails closed with 502 when the rate check cannot run',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: VALID_DISPUTE,
      headers: PUBLIC_HEADERS,
      getAccount: unreachableAccount,
      tablesDB: {
        listRows: () => {
          throw new Error('db down');
        },
      },
    });
    const result = await handleSupportRequestsRequest(ctx);
    assert.equal(result.status, 502);
    assert.equal(calls.createRow.length, 0);
  }),
);

// ── shared plumbing ──────────────────────────────────────────────────────────

test('returns a distinct 500 when the function variables are not configured', async () => {
  const { ctx } = fakeContext({
    body: VALID_DISPUTE,
    headers: PUBLIC_HEADERS,
    getAccount: unreachableAccount,
  });
  const result = await handleSupportRequestsRequest(ctx);
  assert.equal(result.status, 500);
});

test(
  'returns 500 when the execution API key is missing',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: VALID_DISPUTE,
      headers: {},
      getAccount: unreachableAccount,
    });
    const result = await handleSupportRequestsRequest(ctx);
    assert.equal(result.status, 500);
  }),
);

test('main.js routes both support actions to this module', async () => {
  for (const action of ['submitDispute', 'submitSupportRequest']) {
    const { ctx } = fakeContext({ body: { action }, headers: {}, getAccount: asOrganizer });
    const result = await main(ctx);
    // submitDispute: 400 from this module's own validator; submitSupportRequest: 401 because
    // it has no JWT — both prove the request never fell through to admin-users.js.
    assert.equal(result.status, action === 'submitDispute' ? 400 : 401);
    if (action === 'submitDispute') {
      assert.match(result.body.error, /valid email/);
    }
  }
});
