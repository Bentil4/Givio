import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';

// Story 7.1: Organizer-tier team management through addTeamMember / revokeMembership /
// listTeamMembers, run against a small in-memory store that honours the equal/contains queries
// the Function actually sends — so tenant scoping is exercised, not assumed.

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

function matches(row, queries) {
  return queries
    .map((q) => JSON.parse(q))
    .every((q) => {
      if (q.method === 'equal') return q.values.includes(row[q.attribute]);
      if (q.method === 'contains') {
        return (row[q.attribute] ?? []).some((v) => q.values.includes(v));
      }
      return true;
    });
}

function seedStore() {
  return {
    'tenants-1': {
      'tenant-a': {
        $id: 'tenant-a',
        status: 'approved',
        superOrganizerId: 'so-a',
        $permissions: ['read("label:admin")', 'read("user:so-a")'],
      },
      'tenant-b': { $id: 'tenant-b', status: 'approved', superOrganizerId: 'so-b' },
      'tenant-p': { $id: 'tenant-p', status: 'pending', superOrganizerId: 'so-p' },
    },
    'memberships-1': {
      'm-so-a': {
        $id: 'm-so-a',
        userId: 'so-a',
        tenantId: 'tenant-a',
        role: 'super_organizer',
        status: 'active',
      },
      'm-org-a': {
        $id: 'm-org-a',
        userId: 'org-a',
        tenantId: 'tenant-a',
        role: 'organizer',
        status: 'active',
      },
      'm-op-a': {
        $id: 'm-op-a',
        userId: 'op-a',
        tenantId: 'tenant-a',
        role: 'operator',
        status: 'active',
      },
      'm-gone-a': {
        $id: 'm-gone-a',
        userId: 'gone-a',
        tenantId: 'tenant-a',
        role: 'organizer',
        status: 'revoked',
      },
      'm-so-b': {
        $id: 'm-so-b',
        userId: 'so-b',
        tenantId: 'tenant-b',
        role: 'super_organizer',
        status: 'active',
      },
      'm-op-b': {
        $id: 'm-op-b',
        userId: 'op-b',
        tenantId: 'tenant-b',
        role: 'operator',
        status: 'active',
      },
      'm-so-p': {
        $id: 'm-so-p',
        userId: 'so-p',
        tenantId: 'tenant-p',
        role: 'super_organizer',
        status: 'active',
      },
    },
    'events-1': {
      'event-a1': { $id: 'event-a1', tenantId: 'tenant-a', assignedUserIds: ['org-a', 'op-a'] },
    },
  };
}

const ACCOUNTS = {
  'admin-1': { $id: 'admin-1', name: 'Admin', email: 'admin@givio.app', labels: ['admin'] },
  'so-a': { $id: 'so-a', name: 'Yaw Asante', email: 'yaw@a.co', labels: [] },
  'org-a': { $id: 'org-a', name: 'Ama Owusu', email: 'ama@a.co', labels: [] },
  'op-a': { $id: 'op-a', name: 'Kwesi Boateng', email: 'kwesi@a.co', labels: ['operator'] },
  'gone-a': { $id: 'gone-a', name: 'Gone', email: 'gone@a.co', labels: [] },
  'so-b': { $id: 'so-b', name: 'Other Boss', email: 'boss@b.co', labels: [] },
  'op-b': { $id: 'op-b', name: 'Other Op', email: 'op@b.co', labels: ['operator'] },
  'so-p': { $id: 'so-p', name: 'Pending Boss', email: 'boss@p.co', labels: [] },
  nobody: { $id: 'nobody', name: 'No Relationship', email: 'no@x.co', labels: [] },
};

function fakeContext({ body, as, store = seedStore(), accounts, failOn = {} }) {
  const jsonCalls = [];
  const errors = [];
  const calls = {};
  const accountStore = structuredClone(accounts ?? ACCOUNTS);
  let nextId = 0;

  const track = (name, args) => {
    calls[name] = calls[name] ?? [];
    calls[name].push([args]);
    if (failOn[name]) throw new Error(`${name} failed`);
  };

  class AccountCtor {
    async get() {
      return accountStore[as];
    }
  }

  class DatabasesCtor {
    async getRow(args) {
      track('getRow', args);
      const row = store[args.tableId]?.[args.rowId];
      if (!row) throw new Error('Row not found');
      return row;
    }
    async listRows(args) {
      track('listRows', args);
      const rows = Object.values(store[args.tableId] ?? {}).filter((r) => matches(r, args.queries));
      return { rows };
    }
    async createRow(args) {
      track('createRow', args);
      const row = { $id: args.rowId, ...args.data, $permissions: args.permissions };
      store[args.tableId][row.$id] = row;
      return row;
    }
    async updateRow(args) {
      track('updateRow', args);
      const row = store[args.tableId][args.rowId];
      Object.assign(row, args.data);
      if (args.permissions) row.$permissions = args.permissions;
      return row;
    }
  }

  class UsersCtor {
    async get(args) {
      track('usersGet', args);
      const account = accountStore[args.userId];
      if (!account) throw new Error('User not found');
      return account;
    }
    async create(args) {
      track('usersCreate', args);
      const userId = `new-${++nextId}`;
      accountStore[userId] = { $id: userId, name: args.name, email: args.email, labels: [] };
      return accountStore[userId];
    }
    async updateLabels(args) {
      track('updateLabels', args);
      accountStore[args.userId].labels = args.labels;
      return accountStore[args.userId];
    }
  }

  const res = {
    json(responseBody, status = 200) {
      const result = { body: responseBody, status };
      jsonCalls.push(result);
      return result;
    },
  };

  return {
    ctx: {
      req: {
        bodyRaw: JSON.stringify(body),
        headers: { 'x-appwrite-user-jwt': `${as}-jwt`, 'x-appwrite-key': 'dynamic-key' },
      },
      res,
      log: () => {},
      error: (msg) => errors.push(msg),
      ClientCtor: FakeClient,
      AccountCtor,
      UsersCtor,
      DatabasesCtor,
    },
    store,
    accountStore,
    calls,
    errors,
  };
}

function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_EVENTS_COLLECTION_ID = 'events-1';
    process.env.APPWRITE_DONATIONS_COLLECTION_ID = 'donations-1';
    process.env.APPWRITE_TENANTS_COLLECTION_ID = 'tenants-1';
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID = 'memberships-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
      delete process.env.APPWRITE_DONATIONS_COLLECTION_ID;
      delete process.env.APPWRITE_TENANTS_COLLECTION_ID;
      delete process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
    }
  };
}

const add = (role, extra = {}) => ({
  action: 'addTeamMember',
  name: 'Kojo Mensah',
  email: 'kojo@a.co',
  role,
  ...extra,
});

async function run(options) {
  const context = fakeContext(options);
  const result = await handleTenantMembershipRequest(context.ctx);
  return { result, ...context };
}

function newMembership(store) {
  return Object.values(store['memberships-1']).find((m) => m.userId?.startsWith('new-'));
}

// ── addTeamMember ───────────────────────────────────────────────────────────

test(
  'a Super Organizer adds a co-Organizer: new Account + active Membership at their own tenant, no Event access, Tenant read granted (AC1)',
  withEnv(async () => {
    const { result, store, calls } = await run({ body: add('organizer'), as: 'so-a' });

    assert.equal(result.status, 200);
    assert.equal(result.body.tenantId, 'tenant-a');
    assert.equal(result.body.setupIncomplete, false);
    assert.ok(result.body.generatedPassword);

    const membership = newMembership(store);
    assert.equal(membership.tenantId, 'tenant-a');
    assert.equal(membership.role, 'organizer');
    assert.equal(membership.status, 'active');
    assert.equal(membership.grantedBy, 'so-a');
    assert.notEqual(membership.userId, 'so-a');

    // No Event write or assignment access. Organizer-tier members may hold tenant-wide *read*
    // (AD-2, amended 2026-09-30), so only non-read grants and assignment are asserted absent.
    assert.deepEqual(store['events-1']['event-a1'].assignedUserIds, ['org-a', 'op-a']);
    for (const event of Object.values(store['events-1'])) {
      const own = (event.$permissions ?? []).filter((p) => p.includes(`user:${membership.userId}`));
      assert.ok(
        own.every((p) => p.startsWith('read(')),
        `non-read grant on ${event.$id}: ${own}`,
      );
    }

    // Tenant row read grants are derived: Admin + every active Organizer-tier member — the new
    // co-Organizer included; the Operator and the revoked Organizer excluded.
    assert.deepEqual(store['tenants-1']['tenant-a'].$permissions, [
      'read("label:admin")',
      'read("user:so-a")',
      'read("user:org-a")',
      `read("user:${membership.userId}")`,
    ]);
    assert.equal(calls.updateLabels, undefined);
  }),
);

test(
  'a Super Organizer adds an Operator: the operator Label is set so they can sign in to /organizer, and the Tenant row is untouched',
  withEnv(async () => {
    const { result, store, accountStore, calls } = await run({ body: add('operator'), as: 'so-a' });

    assert.equal(result.status, 200);
    const membership = newMembership(store);
    assert.equal(membership.role, 'operator');
    assert.deepEqual(accountStore[membership.userId].labels, ['operator']);
    assert.ok(!calls.updateRow?.some(([args]) => args.tableId === 'tenants-1'));
  }),
);

test(
  'a co-Organizer may add an Operator',
  withEnv(async () => {
    const { result, store } = await run({ body: add('operator'), as: 'org-a' });

    assert.equal(result.status, 200);
    assert.equal(newMembership(store).grantedBy, 'org-a');
  }),
);

test(
  'a co-Organizer adding an Organizer is refused server-side before any Account is created (AC3, FR-11)',
  withEnv(async () => {
    const { result, calls } = await run({ body: add('organizer'), as: 'org-a' });

    assert.equal(result.status, 403);
    assert.equal(calls.usersCreate, undefined);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'nobody — Admin included — can add a super_organizer through addTeamMember',
  withEnv(async () => {
    for (const as of ['so-a', 'admin-1']) {
      const { result, calls } = await run({
        body: add('super_organizer', { tenantId: 'tenant-a' }),
        as,
      });
      assert.equal(result.status, 400, as);
      assert.equal(calls.usersCreate, undefined, as);
    }
  }),
);

test(
  'a Super Organizer cannot add to another tenant by supplying its tenantId (FR-2)',
  withEnv(async () => {
    const { result, calls } = await run({
      body: add('operator', { tenantId: 'tenant-b' }),
      as: 'so-a',
    });

    assert.equal(result.status, 403);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  'supplying their own tenantId is accepted',
  withEnv(async () => {
    const { result } = await run({ body: add('operator', { tenantId: 'tenant-a' }), as: 'so-a' });
    assert.equal(result.status, 200);
  }),
);

test(
  'a pending tenant’s Super Organizer is refused every team action (FR-9)',
  withEnv(async () => {
    for (const body of [
      add('operator'),
      { action: 'listTeamMembers' },
      { action: 'revokeMembership', membershipId: 'm-so-p' },
    ]) {
      const { result, calls } = await run({ body, as: 'so-p' });
      assert.equal(result.status, 403, body.action);
      assert.equal(calls.usersCreate, undefined);
      assert.equal(calls.updateRow, undefined);
    }
  }),
);

test(
  'a suspended tenant’s Super Organizer is refused',
  withEnv(async () => {
    const store = seedStore();
    store['tenants-1']['tenant-a'].status = 'suspended';
    const { result, calls } = await run({ body: add('operator'), as: 'so-a', store });

    assert.equal(result.status, 403);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  'an Account with no Membership, or only a revoked one, is refused',
  withEnv(async () => {
    for (const as of ['nobody', 'gone-a']) {
      const { result, calls } = await run({ body: add('operator'), as });
      assert.equal(result.status, 403, as);
      assert.equal(calls.usersCreate, undefined, as);
    }
  }),
);

test(
  'an Operator (Label-bearing) is refused every team action before any lookup',
  withEnv(async () => {
    for (const body of [
      add('operator'),
      { action: 'listTeamMembers' },
      { action: 'revokeMembership', membershipId: 'm-op-a' },
    ]) {
      const { result, calls } = await run({ body, as: 'op-a' });
      assert.equal(result.status, 403, body.action);
      assert.equal(calls.listRows, undefined);
    }
  }),
);

test(
  'an Operator Membership without the Label is still refused — only Organizer-tier roles manage a team',
  withEnv(async () => {
    const accounts = structuredClone(ACCOUNTS);
    accounts['op-a'].labels = [];
    const { result, calls } = await run({ body: add('operator'), as: 'op-a', accounts });

    assert.equal(result.status, 403);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  'a failed caller-Membership lookup fails closed with 502',
  withEnv(async () => {
    const { result, calls } = await run({
      body: add('operator'),
      as: 'so-a',
      failOn: { listRows: true },
    });

    assert.equal(result.status, 502);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  'Admin keeps full access but must name the tenant',
  withEnv(async () => {
    const missing = await run({ body: add('organizer'), as: 'admin-1' });
    assert.equal(missing.result.status, 400);

    const { result, store } = await run({
      body: add('organizer', { tenantId: 'tenant-b' }),
      as: 'admin-1',
    });
    assert.equal(result.status, 200);
    const membership = newMembership(store);
    assert.equal(membership.tenantId, 'tenant-b');
    assert.ok(
      store['tenants-1']['tenant-b'].$permissions.includes(`read("user:${membership.userId}")`),
    );
  }),
);

test(
  'a failed access-setup step does not fail the add — it reports setupIncomplete',
  withEnv(async () => {
    const { result, store } = await run({
      body: add('operator'),
      as: 'so-a',
      failOn: { updateLabels: true },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.setupIncomplete, true);
    assert.equal(newMembership(store).status, 'active');
  }),
);

// ── revokeMembership ────────────────────────────────────────────────────────

test(
  'a Super Organizer revokes a co-Organizer: Membership revoked, Event grants swept, Tenant read removed — and that co-Organizer can no longer add Operators (AC2)',
  withEnv(async () => {
    const store = seedStore();
    const { result } = await run({
      body: { action: 'revokeMembership', membershipId: 'm-org-a' },
      as: 'so-a',
      store,
    });

    assert.equal(result.status, 200);
    assert.equal(store['memberships-1']['m-org-a'].status, 'revoked');
    assert.ok(!store['events-1']['event-a1'].$permissions.includes('read("user:org-a")'));
    assert.ok(store['events-1']['event-a1'].$permissions.includes('read("user:op-a")'));
    assert.deepEqual(store['tenants-1']['tenant-a'].$permissions, [
      'read("label:admin")',
      'read("user:so-a")',
    ]);

    const after = await run({ body: add('operator'), as: 'org-a', store });
    assert.equal(after.result.status, 403);
    assert.equal(after.calls.usersCreate, undefined);
  }),
);

test(
  'a co-Organizer revokes an Operator: the operator Label is removed, other Labels kept',
  withEnv(async () => {
    const accounts = structuredClone(ACCOUNTS);
    accounts['op-a'].labels = ['operator', 'keepme'];
    const { result, store, accountStore } = await run({
      body: { action: 'revokeMembership', membershipId: 'm-op-a' },
      as: 'org-a',
      accounts,
    });

    assert.equal(result.status, 200);
    assert.equal(store['memberships-1']['m-op-a'].status, 'revoked');
    assert.deepEqual(accountStore['op-a'].labels, ['keepme']);
  }),
);

test(
  'role limits on revoke: an Organizer cannot revoke an Organizer or the Super Organizer; the Super Organizer cannot revoke themself',
  withEnv(async () => {
    for (const [as, membershipId] of [
      ['org-a', 'm-org-a'],
      ['org-a', 'm-so-a'],
      ['so-a', 'm-so-a'],
    ]) {
      const { result, calls } = await run({
        body: { action: 'revokeMembership', membershipId },
        as,
      });
      assert.equal(result.status, 403, `${as} → ${membershipId}`);
      assert.equal(calls.updateRow, undefined);
    }
  }),
);

test(
  "another tenant's Membership is indistinguishable from a missing one (FR-2)",
  withEnv(async () => {
    const other = await run({
      body: { action: 'revokeMembership', membershipId: 'm-op-b' },
      as: 'so-a',
    });
    const missing = await run({
      body: { action: 'revokeMembership', membershipId: 'does-not-exist' },
      as: 'so-a',
    });

    assert.equal(other.result.status, 404);
    assert.deepEqual(other.result, missing.result);
    assert.equal(other.calls.updateRow, undefined);
    assert.equal(other.store['memberships-1']['m-op-b'].status, 'active');
  }),
);

test(
  'Admin may still revoke anyone, including a Super Organizer',
  withEnv(async () => {
    const { result, store } = await run({
      body: { action: 'revokeMembership', membershipId: 'm-so-b' },
      as: 'admin-1',
    });

    assert.equal(result.status, 200);
    assert.equal(store['memberships-1']['m-so-b'].status, 'revoked');
    assert.deepEqual(store['tenants-1']['tenant-b'].$permissions, ['read("label:admin")']);
  }),
);

test(
  'a failed access-removal step after the revoke is reported as 502, and a retry completes it',
  withEnv(async () => {
    const store = seedStore();
    const failed = await run({
      body: { action: 'revokeMembership', membershipId: 'm-op-a' },
      as: 'so-a',
      store,
      failOn: { updateLabels: true },
    });
    assert.equal(failed.result.status, 502);
    assert.equal(store['memberships-1']['m-op-a'].status, 'revoked');

    const retry = await run({
      body: { action: 'revokeMembership', membershipId: 'm-op-a' },
      as: 'so-a',
      store,
    });
    assert.equal(retry.result.status, 200);
    assert.deepEqual(retry.accountStore['op-a'].labels, []);
  }),
);

// ── listTeamMembers ─────────────────────────────────────────────────────────

test(
  "listTeamMembers returns only the caller's own tenant's active members, with names and the caller marked",
  withEnv(async () => {
    const { result, calls } = await run({ body: { action: 'listTeamMembers' }, as: 'org-a' });

    assert.equal(result.status, 200);
    assert.equal(result.body.tenantId, 'tenant-a');
    const byId = Object.fromEntries(result.body.members.map((m) => [m.userId, m]));
    assert.deepEqual(Object.keys(byId).sort(), ['op-a', 'org-a', 'so-a']);
    assert.equal(byId['so-a'].name, 'Yaw Asante');
    assert.equal(byId['so-a'].role, 'super_organizer');
    assert.equal(byId['op-a'].email, 'kwesi@a.co');
    assert.equal(byId['org-a'].isSelf, true);
    assert.equal(byId['so-a'].isSelf, false);
    assert.ok(!calls.usersGet.some(([args]) => ['so-b', 'op-b'].includes(args.userId)));
  }),
);

test(
  'listTeamMembers ignores a supplied tenantId that is not the caller’s own',
  withEnv(async () => {
    const { result } = await run({
      body: { action: 'listTeamMembers', tenantId: 'tenant-b' },
      as: 'so-a',
    });
    assert.equal(result.status, 403);
  }),
);

test(
  'listTeamMembers: Admin names the tenant',
  withEnv(async () => {
    const missing = await run({ body: { action: 'listTeamMembers' }, as: 'admin-1' });
    assert.equal(missing.result.status, 400);

    const { result } = await run({
      body: { action: 'listTeamMembers', tenantId: 'tenant-b' },
      as: 'admin-1',
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.members.map((m) => m.userId).sort(), ['op-b', 'so-b']);
  }),
);

test(
  'listTeamMembers returns 502 when a lookup fails',
  withEnv(async () => {
    const { result } = await run({
      body: { action: 'listTeamMembers' },
      as: 'so-a',
      failOn: { usersGet: true },
    });
    assert.equal(result.status, 502);
  }),
);
