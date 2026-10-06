import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditRows } from './helpers/tenant-events-fixtures.js';
import { run, seedDonationStore, withDonationEnv } from './helpers/tenant-donations-fixtures.js';

const LIST = { action: 'listTenantConflicts' };
const resolve = (conflictId, resolution) => ({
  action: 'resolveTenantConflict',
  conflictId,
  resolution,
});

// ── listTenantConflicts ─────────────────────────────────────────────────────

test(
  "a Super Organizer lists only their own tenant's open conflicts, both versions parsed",
  withDonationEnv(async () => {
    const { result } = await run({ as: 'so-a', body: LIST });

    assert.equal(result.status, 200);
    assert.deepEqual(
      result.body.conflicts.map((c) => c.conflictId),
      ['c-a1'],
    );
    const [conflict] = result.body.conflicts;
    assert.equal(conflict.eventId, 'event-a1');
    assert.equal(conflict.receiptNumber, 'FUN-c-a1');
    assert.equal(conflict.local.amountMinor, 70000);
    assert.equal(conflict.server.amountMinor, 50000);
  }),
);

test(
  'a tenant with no Events has no conflicts, and the conflicts table is never queried',
  withDonationEnv(async () => {
    const store = seedDonationStore();
    store['events-1'] = {};
    const { result, calls } = await run({ as: 'so-a', body: LIST, store });

    assert.deepEqual(result.body.conflicts, []);
    assert.ok(!calls.listRows.some((args) => args.tableId === 'conflicts-1'));
  }),
);

test(
  'a failed conflicts lookup answers 502',
  withDonationEnv(async () => {
    const store = seedDonationStore();
    Object.defineProperty(store, 'conflicts-1', {
      get() {
        throw new Error('conflicts table unreachable');
      },
    });
    const { result } = await run({ as: 'so-a', body: LIST, store });

    assert.equal(result.status, 502);
  }),
);

test(
  'co-Organizer, Operator, Admin and a suspended tenant cannot list conflicts',
  withDonationEnv(async () => {
    for (const as of ['org-a', 'op-a', 'admin-1', 'so-s']) {
      const { result } = await run({ as, body: LIST });
      assert.equal(result.status, 403, `${as} should be refused`);
    }
  }),
);

// ── resolveTenantConflict ───────────────────────────────────────────────────

test(
  'keep-local applies the device version, marks the conflict resolved and audits it',
  withDonationEnv(async () => {
    const { result, store } = await run({ as: 'so-a', body: resolve('c-a1', 'keep-local') });

    assert.equal(result.status, 200);
    assert.equal(store['donations-1']['d-c-a1'].amountMinor, 70000);
    const conflict = store['conflicts-1']['c-a1'];
    assert.ok(conflict.resolvedAt);
    assert.equal(conflict.resolution, 'keep-local');
    const [entry] = auditRows(store);
    assert.equal(entry.entityType, 'donation');
    assert.equal(entry.entityId, 'd-c-a1');
    assert.equal(entry.action, 'edit');
    assert.equal(entry.tenantId, 'tenant-a');
    assert.equal(entry.newValues.resolution, 'keep-local');
  }),
);

test(
  'keep-server writes nothing to the donation',
  withDonationEnv(async () => {
    const { result, calls } = await run({ as: 'so-a', body: resolve('c-a1', 'keep-server') });

    assert.equal(result.status, 200);
    assert.ok(!calls.updateRow.some((args) => args.tableId === 'donations-1'));
  }),
);

test(
  "keep-both saves a -B receipt readable by the Event's own readers",
  withDonationEnv(async () => {
    const { result, store } = await run({ as: 'so-a', body: resolve('c-a1', 'keep-both') });

    assert.equal(result.status, 200);
    const second = Object.values(store['donations-1']).find((d) => d.receiptNumber.endsWith('-B'));
    assert.equal(second.receiptNumber, 'FUN-d-c-a1-B');
    assert.equal(second.amountMinor, 70000);
    assert.ok(second.$permissions.includes('read("user:so-a")'));
    assert.ok(second.$permissions.includes('read("user:org-a")'));
  }),
);

test(
  'an already-resolved conflict is rejected with 400',
  withDonationEnv(async () => {
    const { result } = await run({ as: 'so-a', body: resolve('c-a-done', 'keep-server') });

    assert.equal(result.status, 400);
  }),
);

test(
  "another tenant's and a missing conflict answer the same 404",
  withDonationEnv(async () => {
    const other = await run({ as: 'so-a', body: resolve('c-b1', 'keep-local') });
    const missing = await run({ as: 'so-a', body: resolve('no-such', 'keep-local') });

    assert.deepEqual(other.result, { status: 404, body: { error: 'Conflict not found' } });
    assert.deepEqual(missing.result, other.result);
    assert.equal(other.calls.updateRow, undefined);
  }),
);

test(
  'co-Organizer, Operator, Admin and a suspended tenant cannot resolve a conflict',
  withDonationEnv(async () => {
    for (const as of ['org-a', 'op-a', 'admin-1', 'so-s']) {
      const { result, calls } = await run({ as, body: resolve('c-a1', 'keep-local') });
      assert.equal(result.status, 403, `${as} should be refused`);
      assert.equal(calls.updateRow, undefined);
    }
  }),
);

test(
  'a resolution must name the conflict and one of the three choices',
  withDonationEnv(async () => {
    const noId = await run({ as: 'so-a', body: resolve('', 'keep-local') });
    const badChoice = await run({ as: 'so-a', body: resolve('c-a1', 'keep-newest') });

    assert.equal(noId.result.status, 400);
    assert.equal(badChoice.result.status, 400);
  }),
);
