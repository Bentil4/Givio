import { test } from 'node:test';
import assert from 'node:assert/strict';
import main from '../src/main.js';
import { SUPPORT_INBOX_MAX_LIMIT } from '../src/support-inbox.js';
import { asOperator, inboxContext, withInboxEnv } from './helpers/support-inbox-fixtures.js';

const QUESTION = {
  $id: 'r1',
  $createdAt: '2026-09-30T10:00:00.000Z',
  type: 'question',
  status: 'open',
  tenantId: 't1',
  userId: 'u1',
  contactEmail: 'kwame@asante.test',
  tenantName: null,
  message: 'How do I export?',
  createdAt: '2026-09-30T10:00:00.000Z',
};
const DISPUTE = {
  ...QUESTION,
  $id: 'r2',
  type: 'dispute',
  tenantId: null,
  userId: null,
  tenantName: 'Asante Events',
  message: 'Suspended by mistake.',
};

function tableRows({ support = [], tenants = [] }) {
  return ({ tableId }) => ({ rows: tableId === 'tenants-1' ? tenants : support });
}

test('listSupportRequests refuses a non-admin caller before touching any table', async () => {
  const { ctx, calls } = inboxContext({
    body: { action: 'listSupportRequests' },
    getAccount: asOperator,
  });
  const result = await main(ctx);
  assert.equal(result.status, 403);
  assert.equal(calls.listRows.length, 0);
});

test('setSupportRequestStatus refuses a non-admin caller', async () => {
  const { ctx, calls } = inboxContext({
    body: { action: 'setSupportRequestStatus', requestId: 'r1', status: 'closed' },
    getAccount: asOperator,
  });
  const result = await main(ctx);
  assert.equal(result.status, 403);
  assert.equal(calls.updateRow.length, 0);
});

test(
  'listSupportRequests returns newest first, filtered by status, with default page size',
  withInboxEnv(async () => {
    const { ctx, calls } = inboxContext({
      body: { action: 'listSupportRequests', status: 'open' },
      tables: { listRows: tableRows({ support: [DISPUTE, QUESTION] }) },
    });
    const result = await main(ctx);
    assert.equal(result.status, 200);
    assert.deepEqual(
      result.body.requests.map((r) => r.id),
      ['r2', 'r1'],
    );
    const queries = calls.listRows[0].queries.map(String);
    assert.ok(queries.some((q) => q.includes('orderDesc') && q.includes('$createdAt')));
    assert.ok(queries.some((q) => q.includes('"status"') && q.includes('open')));
    assert.ok(queries.some((q) => q.includes('limit') && q.includes('26')));
  }),
);

test(
  'listSupportRequests pages with a cursor and reports nextCursor only when more rows exist',
  withInboxEnv(async () => {
    const rows = [QUESTION, DISPUTE, { ...QUESTION, $id: 'r3' }];
    const { ctx, calls } = inboxContext({
      body: { action: 'listSupportRequests', limit: 2, cursor: 'r0' },
      tables: { listRows: tableRows({ support: rows }) },
    });
    const result = await main(ctx);
    assert.equal(result.body.requests.length, 2);
    assert.equal(result.body.nextCursor, 'r2');
    const queries = calls.listRows[0].queries.map(String);
    assert.ok(queries.some((q) => q.includes('cursorAfter') && q.includes('r0')));
  }),
);

test(
  'listSupportRequests has no nextCursor on the last page and caps the limit',
  withInboxEnv(async () => {
    const { ctx, calls } = inboxContext({
      body: { action: 'listSupportRequests', limit: 500 },
      tables: { listRows: tableRows({ support: [QUESTION] }) },
    });
    const result = await main(ctx);
    assert.equal(result.body.nextCursor, null);
    const limitQuery = calls.listRows[0].queries.map(String).find((q) => q.includes('limit'));
    assert.ok(limitQuery.includes(String(SUPPORT_INBOX_MAX_LIMIT + 1)));
  }),
);

test(
  'listSupportRequests rejects an invalid status, cursor or limit',
  withInboxEnv(async () => {
    const bodies = [{ status: 'done' }, { cursor: '../x' }, { limit: 0 }, { limit: 'many' }];
    for (const extra of bodies) {
      const { ctx } = inboxContext({ body: { action: 'listSupportRequests', ...extra } });
      assert.equal((await main(ctx)).status, 400, JSON.stringify(extra));
    }
  }),
);

test(
  'listSupportRequests enriches a question with the sender and the tenant name',
  withInboxEnv(async () => {
    const { ctx } = inboxContext({
      body: { action: 'listSupportRequests' },
      tables: {
        listRows: tableRows({ support: [QUESTION], tenants: [{ $id: 't1', name: 'Asante' }] }),
      },
      users: { list: () => ({ users: [{ $id: 'u1', name: 'Kwame', email: 'k@asante.test' }] }) },
    });
    const [request] = (await main(ctx)).body.requests;
    assert.equal(request.senderName, 'Kwame');
    assert.equal(request.senderEmail, 'k@asante.test');
    assert.equal(request.tenantName, 'Asante');
    assert.equal(request.contactEmail, 'kwame@asante.test');
  }),
);

test(
  'listSupportRequests degrades enrichment failures to nulls instead of failing',
  withInboxEnv(async () => {
    const { ctx, errors } = inboxContext({
      body: { action: 'listSupportRequests' },
      tables: {
        listRows: ({ tableId }) => {
          if (tableId === 'tenants-1') {
            throw new Error('tenants down');
          }
          return { rows: [QUESTION] };
        },
      },
      users: {
        list: () => {
          throw new Error('users down');
        },
      },
    });
    const result = await main(ctx);
    assert.equal(result.status, 200);
    const [request] = result.body.requests;
    assert.equal(request.senderName, null);
    assert.equal(request.senderEmail, null);
    assert.equal(request.tenantName, null);
    assert.equal(errors.length, 2);
  }),
);

test(
  'listSupportRequests does not look up users or tenants for a dispute row',
  withInboxEnv(async () => {
    const { ctx, calls } = inboxContext({
      body: { action: 'listSupportRequests' },
      tables: { listRows: tableRows({ support: [DISPUTE] }) },
    });
    const [request] = (await main(ctx)).body.requests;
    assert.equal(request.tenantName, 'Asante Events');
    assert.equal(calls.usersList.length, 0);
    assert.equal(calls.listRows.length, 1);
  }),
);

test(
  'listSupportRequests answers 502 when the table read fails',
  withInboxEnv(async () => {
    const { ctx } = inboxContext({
      body: { action: 'listSupportRequests' },
      tables: {
        listRows: () => {
          throw new Error('db down');
        },
      },
    });
    assert.equal((await main(ctx)).status, 502);
  }),
);

test(
  'setSupportRequestStatus records who closed a request and when',
  withInboxEnv(async () => {
    const { ctx, calls } = inboxContext({
      body: { action: 'setSupportRequestStatus', requestId: 'r1', status: 'closed' },
    });
    const before = Date.now();
    const result = await main(ctx);
    assert.equal(result.status, 200);
    const { data, rowId } = calls.updateRow[0];
    assert.equal(rowId, 'r1');
    assert.equal(data.status, 'closed');
    assert.equal(data.closedBy, 'admin-1');
    assert.ok(Date.parse(data.closedAt) >= before, 'closedAt is the time of the change');
    assert.deepEqual(result.body.request, { id: 'r1', ...data });
  }),
);

test(
  'setSupportRequestStatus clears the closer when a request is reopened',
  withInboxEnv(async () => {
    const { ctx, calls } = inboxContext({
      body: { action: 'setSupportRequestStatus', requestId: 'r1', status: 'open' },
    });
    const result = await main(ctx);
    assert.equal(result.status, 200);
    assert.deepEqual(calls.updateRow[0].data, { status: 'open', closedAt: null, closedBy: null });
    assert.deepEqual(result.body.request, {
      id: 'r1',
      status: 'open',
      closedAt: null,
      closedBy: null,
    });
  }),
);

test(
  'listSupportRequests names the Admin who closed a request, in the same Users lookup',
  withInboxEnv(async () => {
    const closed = {
      ...QUESTION,
      status: 'closed',
      closedAt: '2026-10-01T09:00:00.000Z',
      closedBy: 'admin-9',
    };
    const { ctx, calls } = inboxContext({
      body: { action: 'listSupportRequests', status: 'closed' },
      tables: { listRows: tableRows({ support: [closed] }) },
      users: {
        list: () => ({
          users: [
            { $id: 'u1', name: 'Kwame', email: 'kwame@asante.test' },
            { $id: 'admin-9', name: 'Darko', email: 'darko@givio.test' },
          ],
        }),
      },
    });
    const [request] = (await main(ctx)).body.requests;
    assert.equal(calls.usersList.length, 1);
    assert.equal(request.closedAt, '2026-10-01T09:00:00.000Z');
    assert.equal(request.closedBy, 'admin-9');
    assert.equal(request.closedByName, 'Darko');
    assert.equal(request.senderName, 'Kwame');
  }),
);

test(
  'listSupportRequests leaves the closer empty for an open request',
  withInboxEnv(async () => {
    const { ctx } = inboxContext({
      body: { action: 'listSupportRequests' },
      tables: { listRows: tableRows({ support: [QUESTION] }) },
    });
    const [request] = (await main(ctx)).body.requests;
    assert.equal(request.closedAt, null);
    assert.equal(request.closedBy, null);
    assert.equal(request.closedByName, null);
  }),
);

test(
  'setSupportRequestStatus validates the request id and status',
  withInboxEnv(async () => {
    const bodies = [
      { requestId: 'r1', status: 'resolved' },
      { requestId: 'r1' },
      { requestId: '../r1', status: 'open' },
      { status: 'open' },
    ];
    for (const extra of bodies) {
      const { ctx, calls } = inboxContext({
        body: { action: 'setSupportRequestStatus', ...extra },
      });
      assert.equal((await main(ctx)).status, 400, JSON.stringify(extra));
      assert.equal(calls.updateRow.length, 0);
    }
  }),
);

test(
  'setSupportRequestStatus answers 404 for a missing row and 502 for other failures',
  withInboxEnv(async () => {
    const failures = [
      [{ code: 404, message: 'not found' }, 404],
      [new Error('boom'), 502],
    ];
    for (const [failure, expected] of failures) {
      const { ctx } = inboxContext({
        body: { action: 'setSupportRequestStatus', requestId: 'r1', status: 'open' },
        tables: {
          updateRow: () => {
            throw failure;
          },
        },
      });
      assert.equal((await main(ctx)).status, expected);
    }
  }),
);
