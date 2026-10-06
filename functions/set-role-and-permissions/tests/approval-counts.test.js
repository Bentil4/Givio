import { test } from 'node:test';
import assert from 'node:assert/strict';
import main from '../src/main.js';
import { fakeRequestContext, withEnv } from './helpers/duplicate-events-fixtures.js';

const COUNT = { action: 'countPendingApprovals' };

const TOTALS = { 'tenants-1': 2, 'reviews-1': 3, 'flags-1': 1 };

const IDENTITY_ENV = {
  APPWRITE_IDENTITY_FLAGS_COLLECTION_ID: 'identity-flags-1',
  APPWRITE_IDENTITY_REVIEWS_COLLECTION_ID: 'reviews-1',
};

function countingDatabases(listCalls, failingTableId) {
  return class DatabasesCtor {
    async listRows(args) {
      listCalls.push(args);
      if (args.tableId === failingTableId) throw new Error('listRows failed');
      return { total: TOTALS[args.tableId], rows: [] };
    }
  };
}

async function call({ as = 'admin-1', failingTableId } = {}) {
  const { ctx, errors } = fakeRequestContext({ body: COUNT, as });
  const listCalls = [];
  ctx.DatabasesCtor = countingDatabases(listCalls, failingTableId);
  const result = await main(ctx);
  return { result, listCalls, errors };
}

const parsedQueries = (listCall) => listCall.queries.map((q) => JSON.parse(q));

test(
  'Admin gets the pending count of each Approvals queue',
  withEnv(async () => {
    const { result } = await call();

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      success: true,
      counts: { applications: 2, identityReviews: 3, duplicateEvents: 1 },
    });
  }, IDENTITY_ENV),
);

test(
  'each count filters by the statuses its Approvals tab lists, and reads one row at most',
  withEnv(async () => {
    const { listCalls } = await call();

    const statusesByTable = Object.fromEntries(
      listCalls.map((listCall) => [
        listCall.tableId,
        parsedQueries(listCall).find((q) => q.method === 'equal').values,
      ]),
    );
    assert.deepEqual(statusesByTable, {
      'tenants-1': ['pending'],
      'reviews-1': ['open', 'unmatched'],
      'flags-1': ['open'],
    });
    for (const listCall of listCalls) {
      assert.deepEqual(
        parsedQueries(listCall).find((q) => q.method === 'limit'),
        { method: 'limit', values: [1] },
      );
    }
  }, IDENTITY_ENV),
);

test(
  'a non-Admin caller is refused before anything is counted',
  withEnv(async () => {
    const { result, listCalls } = await call({ as: 'so-a' });

    assert.equal(result.status, 403);
    assert.equal(listCalls.length, 0);
  }, IDENTITY_ENV),
);

test(
  'a failed count is a 502, never a partial or zero count',
  withEnv(async () => {
    const { result, errors } = await call({ failingTableId: 'reviews-1' });

    assert.equal(result.status, 502);
    assert.equal(result.body.counts, undefined);
    assert.match(errors[0], /countPendingApprovals: count failed/);
  }, IDENTITY_ENV),
);

test(
  'a missing queue table ID is a server misconfiguration',
  withEnv(async () => {
    const { result, listCalls } = await call();

    assert.equal(result.status, 500);
    assert.equal(listCalls.length, 0);
  }),
);
