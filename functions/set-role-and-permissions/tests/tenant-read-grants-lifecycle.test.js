import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import {
  ADMIN_ONLY,
  withEnv,
  invoke,
  canRead,
  membership,
  tenantFixture,
  backfill,
} from './helpers/tenant-read-grants-fixtures.js';

test(
  "backfill: an approved tenant's organizer-tier members get read on every Event and Donation",
  withEnv(async () => {
    const store = tenantFixture();

    const result = await backfill(store, { tenantId: 't1' });

    assert.equal(result.status, 200);
    for (const row of [...store.tables['events-1'], ...store.tables['donations-1']]) {
      assert.ok(canRead(row, 'org-1'), `${row.$id} readable by super_organizer`);
      assert.ok(canRead(row, 'org-2'), `${row.$id} readable by organizer`);
      // Organizer-tier grants are read-only; write stays with the Admin Label.
      assert.ok(!row.$permissions.some((p) => /^(update|delete)\("user:/.test(p)));
    }
  }),
);

test(
  'operators stay assignment-only: read on their assigned Event and its Donations, nothing else',
  withEnv(async () => {
    const store = tenantFixture();

    await backfill(store, { tenantId: 't1' });

    const [e1, e2] = store.tables['events-1'];
    const [d1, , d3] = store.tables['donations-1'];
    assert.ok(canRead(e1, 'op-1'));
    assert.ok(canRead(d1, 'op-1'));
    assert.ok(!canRead(e2, 'op-1'));
    assert.ok(!canRead(d3, 'op-1'));
    for (const row of [...store.tables['events-1'], ...store.tables['donations-1']]) {
      assert.ok(!canRead(row, 'op-2'), `${row.$id} not readable by an unassigned Operator`);
    }
  }),
);

test(
  'a pending tenant grants nobody — creating an organizer Membership there adds no read',
  withEnv(async () => {
    const store = tenantFixture({ tenantStatus: 'pending', memberships: [] });

    const result = await invoke(handleTenantMembershipRequest, store, {
      action: 'createMembership',
      userId: 'org-1',
      tenantId: 't1',
      role: 'organizer',
    });

    assert.equal(result.status, 200);
    for (const row of [...store.tables['events-1'], ...store.tables['donations-1']]) {
      assert.deepEqual(row.$permissions, ADMIN_ONLY);
    }
  }),
);

test(
  'membership activation in an approved tenant grants the new organizer read on Events and Donations',
  withEnv(async () => {
    const store = tenantFixture({ memberships: [membership('m-op', 'op-1', 'operator')] });

    const result = await invoke(handleTenantMembershipRequest, store, {
      action: 'createMembership',
      userId: 'org-9',
      tenantId: 't1',
      role: 'organizer',
    });

    assert.equal(result.status, 200);
    for (const row of [...store.tables['events-1'], ...store.tables['donations-1']]) {
      assert.ok(canRead(row, 'org-9'), `${row.$id} readable by the new organizer`);
    }
    assert.ok(canRead(store.tables['events-1'][0], 'op-1'));
  }),
);

test(
  "revoking an organizer's Membership removes its read from Events AND Donations, leaving others",
  withEnv(async () => {
    const store = tenantFixture();
    await backfill(store, { tenantId: 't1' });

    const result = await invoke(handleTenantMembershipRequest, store, {
      action: 'revokeMembership',
      membershipId: 'm-co',
    });

    assert.equal(result.status, 200);
    for (const row of [...store.tables['events-1'], ...store.tables['donations-1']]) {
      assert.ok(!canRead(row, 'org-2'), `${row.$id} no longer readable by the revoked organizer`);
      assert.ok(canRead(row, 'org-1'), `${row.$id} still readable by the remaining organizer`);
    }
    assert.ok(canRead(store.tables['donations-1'][0], 'op-1'));
  }),
);

test(
  "revoking an assigned Operator removes it from its Event's Donations too",
  withEnv(async () => {
    const store = tenantFixture();
    await backfill(store, { tenantId: 't1' });

    await invoke(handleTenantMembershipRequest, store, {
      action: 'revokeMembership',
      membershipId: 'm-op',
    });

    const [e1] = store.tables['events-1'];
    const [d1, d2] = store.tables['donations-1'];
    for (const row of [e1, d1, d2]) {
      assert.ok(!canRead(row, 'op-1'));
      assert.ok(canRead(row, 'org-1'));
    }
    assert.deepEqual(e1.assignedUserIds, ['op-1']);
  }),
);

test(
  'suspending the tenant removes every Membership-derived read from Events and Donations',
  withEnv(async () => {
    const store = tenantFixture();
    await backfill(store, { tenantId: 't1' });

    const result = await invoke(handleTenantMembershipRequest, store, {
      action: 'setTenantStatus',
      tenantId: 't1',
      status: 'suspended',
    });

    assert.equal(result.status, 200);
    for (const row of [...store.tables['events-1'], ...store.tables['donations-1']]) {
      assert.deepEqual(row.$permissions, ADMIN_ONLY, `${row.$id} swept`);
    }
  }),
);

test(
  'approving the tenant grants every active organizer-tier member read, and not revoked ones',
  withEnv(async () => {
    const store = tenantFixture({
      tenantStatus: 'pending',
      memberships: [
        membership('m-org', 'org-1', 'super_organizer'),
        membership('m-old', 'org-old', 'organizer', 'revoked'),
        membership('m-op', 'op-1', 'operator'),
      ],
    });

    const result = await invoke(handleTenantMembershipRequest, store, {
      action: 'setTenantStatus',
      tenantId: 't1',
      status: 'approved',
    });

    assert.equal(result.status, 200);
    for (const row of [...store.tables['events-1'], ...store.tables['donations-1']]) {
      assert.ok(canRead(row, 'org-1'));
      assert.ok(!canRead(row, 'org-old'));
    }
    assert.ok(canRead(store.tables['donations-1'][0], 'op-1'));
  }),
);
