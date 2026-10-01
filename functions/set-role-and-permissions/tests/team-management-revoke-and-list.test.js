import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedStore, ACCOUNTS, withEnv, add, run } from './helpers/team-management-fixtures.js';

// ── revokeMembership ────────────────────────────────────────────────────────

test(
  'a Super Organizer revokes a co-Organizer: Membership revoked, Event grants swept, Tenant read removed — and that co-Organizer can no longer add Operators (AC2)',
  withEnv(async () => {
    const store = seedStore();
    const { result } = await run({
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'm-org-a' },
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
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'm-op-a' },
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
        body: { action: 'revokeMembership', reason: 'routine', membershipId },
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
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'm-op-b' },
      as: 'so-a',
    });
    const missing = await run({
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'does-not-exist' },
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
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'm-so-b' },
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
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'm-op-a' },
      as: 'so-a',
      store,
      failOn: { updateLabels: true },
    });
    assert.equal(failed.result.status, 502);
    assert.equal(store['memberships-1']['m-op-a'].status, 'revoked');

    const retry = await run({
      body: { action: 'revokeMembership', reason: 'routine', membershipId: 'm-op-a' },
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
