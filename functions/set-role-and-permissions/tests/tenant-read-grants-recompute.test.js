import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import { handleTenantGrantsRequest, MAX_ROW_PERMISSIONS } from '../src/tenant-grants.js';
import { handleEventAssignmentRequest } from '../src/event-assignment.js';
import { handleDonationRecordingRequest } from '../src/donation-recording.js';
import {
  ADMIN,
  ADMIN_ONLY,
  withEnv,
  inMemoryStore,
  invoke,
  canRead,
  membership,
  donation,
  tenantFixture,
  backfill,
} from './helpers/tenant-read-grants-fixtures.js';

test(
  'a legacy Event with no tenantId is left untouched and gets no organizer-tier grants',
  withEnv(async () => {
    const store = tenantFixture();
    const legacyPermissions = [...ADMIN_ONLY, 'read("user:op-7")'];
    store.tables['events-1'].push({
      $id: 'legacy',
      type: 'wedding',
      status: 'active',
      assignedUserIds: ['op-7'],
      $permissions: legacyPermissions,
    });
    store.tables['donations-1'].push(donation('d-legacy', 'legacy', legacyPermissions));

    await backfill(store);
    const recorded = await invoke(
      handleDonationRecordingRequest,
      store,
      {
        action: 'recordDonation',
        donationId: 'd-new',
        eventId: 'legacy',
        receiptNumber: 'P-1',
        donorName: 'Ama',
        amountMinor: 500,
        donationType: 'cash',
      },
      ADMIN,
    );

    assert.deepEqual(store.tables['events-1'].at(-1).$permissions, legacyPermissions);
    const legacyDonations = store.tables['donations-1'].filter((d) => d.eventId === 'legacy');
    assert.equal(recorded.status, 200);
    for (const row of legacyDonations) {
      assert.deepEqual(row.$permissions, legacyPermissions);
    }
  }),
);

test(
  'recompute is idempotent: a second backfill writes nothing',
  withEnv(async () => {
    const store = tenantFixture();
    await backfill(store);
    const writesAfterFirst = store.writes.length;
    assert.ok(writesAfterFirst > 0);

    const second = await backfill(store);

    assert.equal(second.status, 200);
    assert.equal(store.writes.length, writesAfterFirst);
    assert.equal(second.body.tenants[0].eventsUpdated, 0);
    assert.equal(second.body.tenants[0].donationsUpdated, 0);
  }),
);

test(
  'lifecycle recompute skips an Event (and its Donations) already in line',
  withEnv(async () => {
    const store = tenantFixture();
    await backfill(store);
    const before = store.writes.length;

    // An unrelated Operator Membership changes no Event's read set.
    await invoke(handleTenantMembershipRequest, store, {
      action: 'createMembership',
      userId: 'op-9',
      tenantId: 't1',
      role: 'operator',
    });

    assert.equal(store.writes.length, before);
  }),
);

test(
  'the backfill is Admin-only',
  withEnv(async () => {
    const store = tenantFixture();

    const result = await invoke(
      handleTenantGrantsRequest,
      store,
      { action: 'recomputeTenantReadGrants' },
      { $id: 'org-1', labels: [] },
    );

    assert.equal(result.status, 403);
    assert.equal(store.writes.length, 0);
  }),
);

test(
  'a failed Donation write is surfaced as 502 and leaves the Event stale so a retry finishes it',
  withEnv(async () => {
    let failing = true;
    const store = tenantFixture({ tenantStatus: 'pending' });
    const failStore = inMemoryStore(store.tables, {
      failUpdate: ({ rowId }) => failing && rowId === 'd2',
    });

    const result = await invoke(handleTenantMembershipRequest, failStore, {
      action: 'setTenantStatus',
      tenantId: 't1',
      status: 'approved',
    });

    assert.equal(result.status, 502);
    assert.equal(result.body.grants.failureCount, 1);
    assert.deepEqual(result.body.grants.failures[0].rowId, 'd2');
    const e1 = failStore.tables['events-1'][0];
    assert.ok(!canRead(e1, 'org-1'), 'Event not marked done while a Donation is stale');

    failing = false;
    const retry = await backfill(failStore, { tenantId: 't1' });
    assert.equal(retry.status, 200);
    for (const row of [...failStore.tables['events-1'], ...failStore.tables['donations-1']]) {
      assert.ok(canRead(row, 'org-1'));
    }
  }),
);

test(
  'a Membership whose grant fan-out fails still returns its generatedPassword (502)',
  withEnv(async () => {
    const store = tenantFixture({ memberships: [] });
    const failStore = inMemoryStore(store.tables, {
      failUpdate: ({ tableId }) => tableId === 'donations-1',
    });

    const result = await invoke(handleTenantMembershipRequest, failStore, {
      action: 'addTeamMember',
      name: 'Kwesi',
      email: 'kwesi@example.com',
      tenantId: 't1',
      role: 'organizer',
    });

    assert.equal(result.status, 502);
    assert.ok(result.body.userId);
    assert.ok(result.body.generatedPassword);
    assert.ok(result.body.grants.failureCount > 0);
  }),
);

test(
  'recordDonation on a tenant Event grants the same read set as the Event',
  withEnv(async () => {
    const store = tenantFixture();

    const result = await invoke(
      handleDonationRecordingRequest,
      store,
      {
        action: 'recordDonation',
        donationId: 'd-new',
        eventId: 'e1',
        receiptNumber: 'P-1',
        donorName: 'Ama',
        amountMinor: 500,
        donationType: 'cash',
      },
      { $id: 'op-1', labels: ['operator'] },
    );

    assert.equal(result.status, 200);
    const created = store.tables['donations-1'].at(-1);
    assert.ok(canRead(created, 'op-1'));
    assert.ok(canRead(created, 'org-1'));
    assert.ok(canRead(created, 'org-2'));
    assert.ok(!canRead(created, 'op-2'));
  }),
);

test(
  "assignOperators on a tenant Event keeps organizer grants and moves its Donations' reads",
  withEnv(async () => {
    const store = tenantFixture();
    await backfill(store);

    const result = await invoke(handleEventAssignmentRequest, store, {
      action: 'assignOperators',
      eventId: 'e1',
      assignedUserIds: ['op-2'],
    });

    assert.equal(result.status, 200);
    const [e1] = store.tables['events-1'];
    const [d1, d2] = store.tables['donations-1'];
    assert.deepEqual(e1.assignedUserIds, ['op-2']);
    for (const row of [e1, d1, d2]) {
      assert.ok(canRead(row, 'op-2'));
      assert.ok(!canRead(row, 'op-1'));
      assert.ok(canRead(row, 'org-1'));
    }
  }),
);

test(
  `a tenant with more organizers than fit is capped at ${MAX_ROW_PERMISSIONS} permissions, assigned Operators kept`,
  withEnv(async () => {
    const organizers = Array.from({ length: 120 }, (_, i) =>
      membership(`m-${i}`, `org-${i}`, 'organizer'),
    );
    const store = tenantFixture({
      memberships: [membership('m-op', 'op-1', 'operator'), ...organizers],
    });

    const result = await backfill(store, { tenantId: 't1' });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.tenants[0].truncatedEventIds, ['e1', 'e2']);
    for (const row of [...store.tables['events-1'], ...store.tables['donations-1']]) {
      assert.equal(row.$permissions.length, MAX_ROW_PERMISSIONS);
    }
    assert.ok(canRead(store.tables['events-1'][0], 'op-1'));
  }),
);
