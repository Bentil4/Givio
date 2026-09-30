import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleFamilyAccessRequest } from '../src/family-access.js';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';

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

function fakeContext({ body, headers = {}, getAccount, tablesDB = {}, randomBytes }) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];
  const calls = {};

  const record =
    (name, target) =>
    async (...args) => {
      calls[name] = calls[name] ?? [];
      calls[name].push(args);
      const impl = target[name];
      return impl ? impl(...args) : undefined;
    };

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }

  class TablesDBCtor {
    getRow = record('getRow', tablesDB);
    listRows = record('listRows', tablesDB);
    updateRow = record('updateRow', tablesDB);
  }

  const res = {
    json(responseBody, status = 200) {
      const result = { body: responseBody, status };
      jsonCalls.push(result);
      return result;
    },
  };

  const req = {
    bodyRaw: JSON.stringify(body),
    headers,
  };

  return {
    ctx: {
      req,
      res,
      log: (msg) => logs.push(msg),
      error: (msg) => errors.push(msg),
      ClientCtor: FakeClient,
      AccountCtor,
      TablesDBCtor,
      randomBytes: randomBytes ?? ((n) => Buffer.alloc(n, 1)),
    },
    jsonCalls,
    logs,
    errors,
    calls,
  };
}

const ADMIN_HEADERS = { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'dynamic-key' };
// resolveAccessCode is unauthenticated (no user JWT) but the Function's own execution API key
// is still present on every invocation regardless of action — it's not a user credential.
const PUBLIC_HEADERS = { 'x-appwrite-key': 'dynamic-key' };
const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });

function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_EVENTS_COLLECTION_ID = 'events-1';
    process.env.APPWRITE_DONATIONS_COLLECTION_ID = 'donations-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
      delete process.env.APPWRITE_DONATIONS_COLLECTION_ID;
    }
  };
}

test(
  'rejects an unknown action with 400',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'notARealAction' },
      headers: {},
      getAccount: asAdmin,
    });
    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 400);
  }),
);

test('returns a distinct 500 when the function variables are not configured', async () => {
  const { ctx } = fakeContext({
    body: { action: 'resolveAccessCode', code: 'ABCD2345' },
    headers: {},
    getAccount: asAdmin,
  });
  const result = await handleFamilyAccessRequest(ctx);
  assert.equal(result.status, 500);
});

test(
  'resolveAccessCode: requires no authentication at all',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'resolveAccessCode', code: 'ABCD2345' },
      headers: PUBLIC_HEADERS,
      getAccount: () => {
        throw new Error('should never be called for resolveAccessCode');
      },
      tablesDB: { listRows: async () => ({ total: 0, rows: [] }) },
    });

    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 404);
  }),
);

test(
  'resolveAccessCode: rejects a malformed code with 400 before touching TablesDB',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'resolveAccessCode', code: 'short' },
      headers: {},
      getAccount: asAdmin,
    });
    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 400);
    assert.equal(calls.listRows, undefined);
  }),
);

test(
  'resolveAccessCode: returns 404 without revealing anything when no event matches',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'resolveAccessCode', code: 'ABCD2345' },
      headers: PUBLIC_HEADERS,
      getAccount: asAdmin,
      tablesDB: { listRows: async () => ({ total: 0, rows: [] }) },
    });
    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 404);
    assert.equal(JSON.stringify(result.body).includes('half'), false);
  }),
);

test(
  'resolveAccessCode: on match, returns sanitized event + donations with no phone/recordedBy/notes',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'resolveAccessCode', code: 'ABCD2345' },
      headers: PUBLIC_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        listRows: async (args) => {
          if (args.tableId === 'events-1') {
            return {
              total: 1,
              rows: [
                {
                  $id: 'e1',
                  name: 'Ama & Kojo',
                  venue: 'Grand Hall',
                  date: '2026-06-01',
                  status: 'active',
                },
              ],
            };
          }
          return {
            total: 1,
            rows: [
              {
                $id: 'd1',
                eventId: 'e1',
                donorName: 'Kofi',
                amountMinor: 5000,
                donationType: 'cash',
                donorPhone: '020 000 0000',
                recordedBy: 'op-1',
                notes: 'internal note',
                recordedAt: '2026-01-01T00:00:00.000Z',
                syncStatus: 'synced',
              },
            ],
          };
        },
      },
    });

    const result = await handleFamilyAccessRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.event.name, 'Ama & Kojo');
    assert.equal(result.body.donations.length, 1);
    const donation = result.body.donations[0];
    assert.equal(donation.donorName, 'Kofi');
    assert.equal('donorPhone' in donation, false);
    assert.equal('recordedBy' in donation, false);
    assert.equal('notes' in donation, false);
  }),
);

test(
  'resolveAccessCode: excludes soft-deleted and conflicted donations',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'resolveAccessCode', code: 'ABCD2345' },
      headers: PUBLIC_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        listRows: async (args) => {
          if (args.tableId === 'events-1') {
            return {
              total: 1,
              rows: [{ $id: 'e1', name: 'Ama & Kojo', date: '2026-06-01', status: 'active' }],
            };
          }
          return {
            total: 2,
            rows: [
              {
                $id: 'd1',
                eventId: 'e1',
                donorName: 'Kofi',
                recordedAt: 't',
                syncStatus: 'synced',
              },
              {
                $id: 'd2',
                eventId: 'e1',
                donorName: 'Ama',
                recordedAt: 't',
                syncStatus: 'synced',
                deletedAt: '2026-01-01T00:00:00.000Z',
              },
              {
                $id: 'd3',
                eventId: 'e1',
                donorName: 'Esi',
                recordedAt: 't',
                syncStatus: 'conflict',
              },
            ],
          };
        },
      },
    });

    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.body.donations.length, 1);
    assert.equal(result.body.donations[0].donorName, 'Kofi');
  }),
);

const EVENT_ROW = { $id: 'e1', name: 'Ama & Kojo', date: '2026-06-01', status: 'active' };

function resolveContext(donationPages) {
  let donationCalls = 0;
  return fakeContext({
    body: { action: 'resolveAccessCode', code: 'ABCD2345' },
    headers: PUBLIC_HEADERS,
    getAccount: asAdmin,
    tablesDB: {
      listRows: async (args) => {
        if (args.tableId === 'events-1') return { total: 1, rows: [EVENT_ROW] };
        const page = donationPages[donationCalls] ?? [];
        donationCalls += 1;
        if (page instanceof Error) throw page;
        return { total: page.length, rows: page };
      },
    },
  });
}

test(
  'resolveAccessCode: drains every page of donations so the family total is never partial (FR-18)',
  withEnv(async () => {
    const donation = (i) => ({
      $id: `d${i}`,
      eventId: 'e1',
      donorName: `Donor ${i}`,
      amountMinor: 1000,
      donationType: 'cash',
      donorPhone: '020 000 0000',
      recordedBy: 'op-1',
      notes: 'internal',
      recordedAt: 't',
      syncStatus: 'synced',
    });
    const page1 = Array.from({ length: 100 }, (_, i) => donation(i));
    const page2 = Array.from({ length: 30 }, (_, i) => donation(100 + i));
    const { ctx, calls } = resolveContext([page1, page2]);

    const result = await handleFamilyAccessRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.donations.length, 130);
    const total = result.body.donations.reduce((sum, d) => sum + d.amountMinor, 0);
    assert.equal(total, 130_000);
    const donationQueries = calls.listRows
      .map(([args]) => args)
      .filter((a) => a.tableId === 'donations-1');
    assert.equal(donationQueries.length, 2);
    assert.ok(
      donationQueries[1].queries.some(
        (q) => q.includes('"method":"cursorAfter"') && q.includes('d99'),
      ),
    );
    const serialized = JSON.stringify(result.body);
    assert.equal(serialized.includes('donorPhone'), false);
    assert.equal(serialized.includes('020 000 0000'), false);
  }),
);

test(
  'resolveAccessCode: reflects the current row state — edited amount shown, soft-deleted row dropped',
  withEnv(async () => {
    const { ctx } = resolveContext([
      [
        {
          $id: 'd1',
          donorName: 'Kofi',
          amountMinor: 7500,
          donationType: 'cash',
          recordedAt: 't',
          syncStatus: 'synced',
        },
        {
          $id: 'd2',
          donorName: 'Ama',
          amountMinor: 2000,
          donationType: 'cash',
          recordedAt: 't',
          syncStatus: 'synced',
          deletedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    ]);

    const result = await handleFamilyAccessRequest(ctx);

    assert.equal(result.status, 200);
    assert.deepEqual(
      result.body.donations.map((d) => [d.id, d.amountMinor]),
      [['d1', 7500]],
    );
  }),
);

test(
  'resolveAccessCode: no donations yet resolves to a well-formed empty list, not an error',
  withEnv(async () => {
    const { ctx } = resolveContext([[]]);

    const result = await handleFamilyAccessRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.event.name, 'Ama & Kojo');
    assert.deepEqual(result.body.donations, []);
  }),
);

test(
  'resolveAccessCode: a failed donations read is a 502, never a false zero total',
  withEnv(async () => {
    const { ctx, errors } = resolveContext([new Error('timeout')]);

    const result = await handleFamilyAccessRequest(ctx);

    assert.equal(result.status, 502);
    assert.equal('donations' in result.body, false);
    assert.equal(errors.length, 1);
  }),
);

test(
  'generateAccessCode: rejects a non-admin caller with 403',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'generateAccessCode', eventId: 'e1' },
      headers: { 'x-appwrite-user-jwt': 'op-jwt', 'x-appwrite-key': 'dynamic-key' },
      getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
    });
    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 403);
  }),
);

test(
  'generateAccessCode: rejects an unauthenticated request with 401',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'generateAccessCode', eventId: 'e1' },
      headers: {},
      getAccount: asAdmin,
    });
    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 401);
  }),
);

test(
  'generateAccessCode: 404 when the event does not exist',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'generateAccessCode', eventId: 'missing' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => {
          throw new Error('row_not_found');
        },
      },
    });
    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 404);
  }),
);

test(
  'generateAccessCode: on success, writes an 8-char code from the safe alphabet and returns it once',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'generateAccessCode', eventId: 'e1' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => ({ $id: 'e1' }),
        listRows: async () => ({ total: 0, rows: [] }),
        updateRow: async (args) => args,
      },
    });

    const result = await handleFamilyAccessRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.accessCode.length, 8);
    assert.ok(!/[01OIL]/.test(result.body.accessCode));
    assert.equal(calls.updateRow[0][0].data.accessCode, result.body.accessCode);
  }),
);

test(
  'generateAccessCode: retries on a collision and still succeeds',
  withEnv(async () => {
    let call = 0;
    const { ctx } = fakeContext({
      body: { action: 'generateAccessCode', eventId: 'e1' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      tablesDB: {
        getRow: async () => ({ $id: 'e1' }),
        listRows: async () => {
          call++;
          return call === 1 ? { total: 1, rows: [{ $id: 'other-event' }] } : { total: 0, rows: [] };
        },
        updateRow: async (args) => args,
      },
      randomBytes: (n) =>
        Buffer.from(Array.from({ length: n }, (_, i) => (call === 0 ? i : i + 50))),
    });

    const result = await handleFamilyAccessRequest(ctx);
    assert.equal(result.status, 200);
    assert.equal(result.body.accessCode.length, 8);
  }),
);

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

function invoke(handler, store, { body, headers, randomBytes }) {
  class AccountCtor {
    async get() {
      return { $id: 'admin-1', labels: ['admin'] };
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
  withEnv(async () => {
    const store = suspensionFixture();
    assert.equal((await resolve(store, 'ABCD2345')).status, 200);

    const generated = await invoke(handleFamilyAccessRequest, store, {
      body: { action: 'generateAccessCode', eventId: 'e1' },
      headers: ADMIN_HEADERS,
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
