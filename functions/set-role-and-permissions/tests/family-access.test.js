import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleFamilyAccessRequest } from '../src/family-access.js';

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
