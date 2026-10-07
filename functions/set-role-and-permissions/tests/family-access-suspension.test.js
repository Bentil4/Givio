import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleFamilyAccessRequest } from '../src/family-access.js';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import {
  FakeClient,
  ADMIN_HEADERS,
  PUBLIC_HEADERS,
  withEnv,
} from './helpers/family-access-fixtures.js';

/**
 * An in-memory table store shared across Function handlers, so one test can run a real
 * write (setTenantStatus's sweep, generateAccessCode's regeneration) and then observe what a
 * following resolveAccessCode sees — instead of hand-stubbing the post-write state.
 */
function inMemoryStore(tables) {
  const reads = [];
  const matches = (row, query) => {
    const { method, attribute, values } = JSON.parse(query);
    if (method === 'equal') return values.includes(row[attribute]);
    if (method === 'contains') return (row[attribute] ?? []).some((v) => values.includes(v));
    return true;
  };

  class TablesDBCtor {
    async getRow({ tableId, rowId }) {
      reads.push(tableId);
      const row = tables[tableId]?.find((r) => r.$id === rowId);
      if (!row) throw new Error('row_not_found');
      return structuredClone(row);
    }
    async listRows({ tableId, queries = [] }) {
      reads.push(tableId);
      const parsed = queries.map((q) => JSON.parse(q));
      const limit = parsed.find((q) => q.method === 'limit')?.values[0] ?? 25;
      const cursor = parsed.find((q) => q.method === 'cursorAfter')?.values[0];
      let rows = (tables[tableId] ?? []).filter((r) => queries.every((q) => matches(r, q)));
      if (cursor) rows = rows.slice(rows.findIndex((r) => r.$id === cursor) + 1);
      rows = rows.slice(0, limit);
      return { total: rows.length, rows: structuredClone(rows) };
    }
    async updateRow({ tableId, rowId, data, permissions }) {
      const row = tables[tableId].find((r) => r.$id === rowId);
      Object.assign(row, data);
      if (permissions) row.$permissions = permissions;
      return structuredClone(row);
    }
  }

  return { TablesDBCtor, tables, reads };
}

const ADMIN = { $id: 'admin-1', labels: ['admin'] };

function invoke(handler, store, { body, headers, randomBytes, account = ADMIN }) {
  class AccountCtor {
    async get() {
      return account;
    }
  }
  return handler({
    req: { bodyRaw: JSON.stringify(body), headers },
    res: { json: (responseBody, status = 200) => ({ body: responseBody, status }) },
    log: () => {},
    error: () => {},
    ClientCtor: FakeClient,
    AccountCtor,
    TablesDBCtor: store.TablesDBCtor,
    DatabasesCtor: store.TablesDBCtor,
    randomBytes,
  });
}

const resolve = (store, code) =>
  invoke(handleFamilyAccessRequest, store, {
    body: { action: 'resolveAccessCode', code },
    headers: PUBLIC_HEADERS,
  });

function suspensionFixture() {
  const operatorGrant = 'read("user:op-1")';
  const donation = (i, extra = {}) => ({
    $id: `d${String(i).padStart(3, '0')}`,
    eventId: 'e1',
    donorName: `Donor ${i}`,
    amountMinor: 1000,
    donationType: 'cash',
    onBehalfOf: 'The family',
    donorPhone: '020 000 0000',
    recordedBy: 'op-1',
    notes: 'internal',
    recordedAt: '2026-06-01T10:00:00.000Z',
    syncStatus: 'synced',
    $permissions: ['read("label:admin")', operatorGrant],
    ...extra,
  });
  return inMemoryStore({
    'tenants-1': [{ $id: 't1', name: 'Kente Events', status: 'approved' }],
    'memberships-1': [{ $id: 'm1', userId: 'op-1', tenantId: 't1', status: 'active' }],
    'events-1': [
      {
        $id: 'e1',
        tenantId: 't1',
        name: 'Ama & Kojo',
        type: 'wedding',
        venue: 'Grand Hall',
        date: '2026-06-01',
        status: 'active',
        accessCode: 'ABCD2345',
        assignedUserIds: ['op-1'],
        $permissions: ['read("label:admin")', operatorGrant],
      },
    ],
    // Past one listAllRows page, so a regression back to a single capped page shows up here too.
    'donations-1': [
      ...Array.from({ length: 120 }, (_, i) => donation(i)),
      donation(120, { deletedAt: '2026-06-01T11:00:00.000Z' }),
    ],
  });
}

function withSuspensionEnv(fn) {
  return withEnv(async () => {
    process.env.APPWRITE_TENANTS_COLLECTION_ID = 'tenants-1';
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID = 'memberships-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_TENANTS_COLLECTION_ID;
      delete process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
    }
  });
}

test(
  "resolveAccessCode: a suspended tenant's family view resolves identically after the permission sweep (Story 9.2 AC1)",
  withSuspensionEnv(async () => {
    const store = suspensionFixture();
    const before = await resolve(store, 'ABCD2345');

    const suspend = await invoke(handleTenantMembershipRequest, store, {
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
      headers: ADMIN_HEADERS,
    });
    assert.equal(suspend.status, 200);
    assert.equal(store.tables['tenants-1'][0].status, 'suspended');
    // The sweep really ran: the Operator's grant is gone from the tenant's Event.
    assert.equal(store.tables['events-1'][0].$permissions.includes('read("user:op-1")'), false);

    const after = await resolve(store, 'ABCD2345');

    assert.equal(before.status, 200);
    assert.equal(after.status, 200);
    assert.deepEqual(after.body, before.body);
    assert.equal(after.body.donations.length, 120);
    assert.equal(JSON.stringify(after.body).includes('020 000 0000'), false);
  }),
);

test(
  "resolveAccessCode: a suspended tenant's view keeps updating with donations recorded after suspension",
  withSuspensionEnv(async () => {
    const store = suspensionFixture();
    await invoke(handleTenantMembershipRequest, store, {
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'suspended' },
      headers: ADMIN_HEADERS,
    });
    store.tables['donations-1'].push({
      $id: 'd999',
      eventId: 'e1',
      donorName: 'Late arrival',
      amountMinor: 2500,
      donationType: 'mobile_money',
      recordedAt: '2026-06-01T12:00:00.000Z',
      syncStatus: 'synced',
    });

    const result = await resolve(store, 'ABCD2345');

    assert.equal(result.status, 200);
    assert.equal(result.body.donations.length, 121);
    assert.equal(result.body.donations.at(-1).donorName, 'Late arrival');
  }),
);

test(
  'resolveAccessCode: never reads Tenant or Membership rows, so no suspension-specific denial path exists (Story 9.2 AC2)',
  withSuspensionEnv(async () => {
    const store = suspensionFixture();
    store.tables['tenants-1'][0].status = 'suspended';
    store.tables['memberships-1'][0].status = 'revoked';

    const result = await resolve(store, 'ABCD2345');

    assert.equal(result.status, 200);
    assert.deepEqual([...new Set(store.reads)].sort(), ['donations-1', 'events-1']);
    assert.deepEqual(Object.keys(result.body).sort(), ['donations', 'event', 'success']);
    assert.deepEqual(Object.keys(result.body.event).sort(), [
      'date',
      'name',
      'status',
      'type',
      'venue',
    ]);
    assert.equal(/suspend|tenant/i.test(JSON.stringify(result.body)), false);
  }),
);

test(
  'resolveAccessCode: after generateAccessCode regenerates, the old code is rejected with the exact body family-live keys off, and the new code resolves',
  withSuspensionEnv(async () => {
    const store = suspensionFixture();
    const organizer = { $id: 'org-1', labels: [] };
    store.tables['memberships-1'].push({
      $id: 'm2',
      userId: organizer.$id,
      tenantId: 't1',
      role: 'organizer',
      status: 'active',
    });
    assert.equal((await resolve(store, 'ABCD2345')).status, 200);

    const generated = await invoke(handleFamilyAccessRequest, store, {
      body: { action: 'generateAccessCode', eventId: 'e1' },
      headers: ADMIN_HEADERS,
      account: organizer,
      randomBytes: (n) => Buffer.from(Array.from({ length: n }, (_, i) => i + 10)),
    });
    assert.equal(generated.status, 200);
    const newCode = generated.body.accessCode;
    assert.notEqual(newCode, 'ABCD2345');

    const oldResult = await resolve(store, 'ABCD2345');
    assert.equal(oldResult.status, 404);
    // FamilyCodeRejectedError (family-access-data.service.ts) matches this exact string.
    assert.deepEqual(oldResult.body, { error: 'Code not recognised' });

    const newResult = await resolve(store, newCode);
    assert.equal(newResult.status, 200);
    assert.equal(newResult.body.event.name, 'Ama & Kojo');
    assert.equal(newResult.body.donations.length, 120);
  }),
);
