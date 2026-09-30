import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import { handleTenantGrantsRequest, MAX_ROW_PERMISSIONS } from '../src/tenant-grants.js';
import { handleEventAssignmentRequest } from '../src/event-assignment.js';
import { handleDonationRecordingRequest } from '../src/donation-recording.js';

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

const ADMIN = { $id: 'admin-1', labels: ['admin'] };
const HEADERS = { 'x-appwrite-user-jwt': 'jwt', 'x-appwrite-key': 'dynamic-key' };
const ADMIN_ONLY = ['read("label:admin")', 'update("label:admin")', 'delete("label:admin")'];
const COMPANY = {
  name: 'Kente Events',
  location: 'Accra',
  size: '11-50',
  type: 'funeral',
  estimatedUserCount: 12,
  verificationDocumentId: 'file-1',
};

const ENV = {
  APPWRITE_DATABASE_ID: 'db-1',
  APPWRITE_EVENTS_COLLECTION_ID: 'events-1',
  APPWRITE_DONATIONS_COLLECTION_ID: 'donations-1',
  APPWRITE_TENANTS_COLLECTION_ID: 'tenants-1',
  APPWRITE_MEMBERSHIPS_COLLECTION_ID: 'memberships-1',
};

function withEnv(fn) {
  return async () => {
    Object.assign(process.env, ENV);
    try {
      await fn();
    } finally {
      for (const key of Object.keys(ENV)) delete process.env[key];
    }
  };
}

/** Tables shared across handlers, so a lifecycle action's effect is observed on real rows. */
function inMemoryStore(tables, { failUpdate = () => false } = {}) {
  const writes = [];
  const matches = (row, query) => {
    const { method, attribute, values } = JSON.parse(query);
    if (method === 'equal') return values.includes(row[attribute]);
    if (method === 'contains') return (row[attribute] ?? []).some((v) => values.includes(v));
    return true;
  };
  const table = (tableId) => (tables[tableId] = tables[tableId] ?? []);

  class TablesDBCtor {
    async getRow({ tableId, rowId }) {
      const row = table(tableId).find((r) => r.$id === rowId);
      if (!row) throw new Error('row_not_found');
      return structuredClone(row);
    }
    async listRows({ tableId, queries = [] }) {
      const parsed = queries.map((q) => JSON.parse(q));
      const limit = parsed.find((q) => q.method === 'limit')?.values[0] ?? 25;
      const cursor = parsed.find((q) => q.method === 'cursorAfter')?.values[0];
      let rows = table(tableId).filter((r) => queries.every((q) => matches(r, q)));
      if (cursor) rows = rows.slice(rows.findIndex((r) => r.$id === cursor) + 1);
      rows = rows.slice(0, limit);
      return { total: rows.length, rows: structuredClone(rows) };
    }
    async updateRow({ tableId, rowId, data, permissions }) {
      if (failUpdate({ tableId, rowId })) throw new Error('write failed');
      const row = table(tableId).find((r) => r.$id === rowId);
      Object.assign(row, data);
      if (permissions) row.$permissions = permissions;
      writes.push({ tableId, rowId });
      return structuredClone(row);
    }
    async createRow({ tableId, rowId, data, permissions }) {
      const row = { $id: rowId, ...data, $permissions: permissions ?? [] };
      table(tableId).push(row);
      return structuredClone(row);
    }
    async incrementRowColumn({ tableId, rowId, column, value }) {
      const row = table(tableId).find((r) => r.$id === rowId);
      row[column] = (row[column] ?? 0) + value;
      return structuredClone(row);
    }
  }

  return { TablesDBCtor, tables, writes };
}

function invoke(handler, store, body, caller = ADMIN, users = {}) {
  class AccountCtor {
    async get() {
      return caller;
    }
  }
  class UsersCtor {
    async get({ userId }) {
      return users[userId] ?? { $id: userId, labels: ['operator'] };
    }
    async create({ userId }) {
      return { $id: userId };
    }
  }
  return handler({
    req: { bodyRaw: JSON.stringify(body), headers: HEADERS },
    res: { json: (responseBody, status = 200) => ({ body: responseBody, status }) },
    log: () => {},
    error: () => {},
    ClientCtor: FakeClient,
    AccountCtor,
    UsersCtor,
    DatabasesCtor: store.TablesDBCtor,
    TablesDBCtor: store.TablesDBCtor,
  });
}

const canRead = (row, uid) => (row.$permissions ?? []).includes(`read("user:${uid}")`);
const membership = (id, userId, role, status = 'active', tenantId = 't1') => ({
  $id: id,
  userId,
  tenantId,
  role,
  status,
});
const donation = (id, eventId, permissions = ADMIN_ONLY) => ({
  $id: id,
  eventId,
  donorName: id,
  amountMinor: 1000,
  $permissions: [...permissions],
});

/** An approved tenant whose rows already carry correct pre-amendment operator grants. */
function tenantFixture({ tenantStatus = 'approved', memberships, extraTables = {} } = {}) {
  const opGrant = [...ADMIN_ONLY, 'read("user:op-1")'];
  return inMemoryStore({
    'tenants-1': [
      {
        $id: 't1',
        status: tenantStatus,
        verifiedBy: 'admin-1',
        verifiedAt: '2026-09-30T00:00:00.000Z',
        ...COMPANY,
      },
    ],
    'memberships-1': memberships ?? [
      membership('m-org', 'org-1', 'super_organizer'),
      membership('m-co', 'org-2', 'organizer'),
      membership('m-op', 'op-1', 'operator'),
      membership('m-op2', 'op-2', 'operator'),
    ],
    'events-1': [
      {
        $id: 'e1',
        tenantId: 't1',
        type: 'wedding',
        status: 'active',
        assignedUserIds: ['op-1'],
        $permissions: tenantStatus === 'approved' ? opGrant : ADMIN_ONLY,
      },
      {
        $id: 'e2',
        tenantId: 't1',
        type: 'funeral',
        status: 'active',
        assignedUserIds: [],
        $permissions: ADMIN_ONLY,
      },
    ],
    'donations-1': [
      donation('d1', 'e1', tenantStatus === 'approved' ? opGrant : ADMIN_ONLY),
      donation('d2', 'e1', tenantStatus === 'approved' ? opGrant : ADMIN_ONLY),
      donation('d3', 'e2'),
    ],
    ...extraTables,
  });
}

const backfill = (store, extra = {}) =>
  invoke(handleTenantGrantsRequest, store, { action: 'recomputeTenantReadGrants', ...extra });

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
