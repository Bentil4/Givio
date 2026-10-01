import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seedStore,
  ACCOUNTS,
  withEnv,
  add,
  run,
  newMembership,
} from './helpers/team-management-fixtures.js';

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
      { action: 'revokeMembership', reason: 'routine', membershipId: 'm-so-p' },
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
      { action: 'revokeMembership', reason: 'routine', membershipId: 'm-op-a' },
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
