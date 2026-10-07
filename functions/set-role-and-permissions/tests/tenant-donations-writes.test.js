import { test } from 'node:test';
import assert from 'node:assert/strict';
import main from '../src/main.js';
import { auditRows, fakeContext } from './helpers/tenant-events-fixtures.js';
import {
  LONG_REASON,
  run,
  seedDonationStore,
  withDonationEnv,
} from './helpers/tenant-donations-fixtures.js';

const edit = (donationId, patch = { amountMinor: 70000 }, reason = LONG_REASON) => ({
  action: 'editTenantDonation',
  donationId,
  patch,
  reason,
});
const softDelete = (donationId, reason = LONG_REASON) => ({
  action: 'softDeleteTenantDonation',
  donationId,
  reason,
});
const restore = (donationId) => ({ action: 'restoreTenantDonation', donationId });

// ── edit ────────────────────────────────────────────────────────────────────

test(
  'a Super Organizer corrects their own donation; the reason and tenant are audited',
  withDonationEnv(async () => {
    const { result, store } = await run({ as: 'so-a', body: edit('d-a1') });

    assert.equal(result.status, 200);
    const row = store['donations-1']['d-a1'];
    assert.equal(row.amountMinor, 70000);
    assert.ok(row.updatedAt);
    const [entry] = auditRows(store);
    assert.equal(entry.entityType, 'donation');
    assert.equal(entry.entityId, 'd-a1');
    assert.equal(entry.action, 'edit');
    assert.equal(entry.performedBy, 'so-a');
    assert.equal(entry.tenantId, 'tenant-a');
    assert.equal(entry.previousValues.amountMinor, 50000);
    assert.equal(entry.newValues.amountMinor, 70000);
    assert.equal(entry.newValues.reason, LONG_REASON);
  }),
);

test(
  "a correction leaves the row's permissions exactly as recorded",
  withDonationEnv(async () => {
    const { calls, store } = await run({ as: 'so-a', body: edit('d-a1') });

    const [update] = calls.updateRow;
    assert.equal(update.permissions, undefined);
    assert.deepEqual(store['donations-1']['d-a1'].$permissions, [
      'read("label:admin")',
      'update("label:admin")',
      'read("user:so-a")',
    ]);
  }),
);

test(
  'only the four editable fields change; receipt, phone and recorder are ignored',
  withDonationEnv(async () => {
    const patch = {
      donorName: 'Ama O.',
      donationType: 'mobile_money',
      onBehalfOf: '  ',
      receiptNumber: 'FORGED-1',
      donorPhone: '+233000000000',
      recordedBy: 'so-a',
    };
    const { result, store } = await run({ as: 'so-a', body: edit('d-a1', patch) });

    assert.equal(result.status, 200);
    const row = store['donations-1']['d-a1'];
    assert.equal(row.donorName, 'Ama O.');
    assert.equal(row.donationType, 'mobile_money');
    assert.equal(row.onBehalfOf, null);
    assert.equal(row.receiptNumber, 'FUN-d-a1');
    assert.equal(row.donorPhone, '+233201234567');
    assert.equal(row.recordedBy, 'op-a');
  }),
);

test(
  'a soft-deleted donation cannot be edited',
  withDonationEnv(async () => {
    const { result, calls } = await run({ as: 'so-a', body: edit('d-a-deleted') });

    assert.equal(result.status, 400);
    assert.equal(calls.updateRow, undefined);
  }),
);

const INVALID_EDITS = [
  ['no donationId', { ...edit('d-a1'), donationId: '' }],
  ['no patch', { ...edit('d-a1'), patch: undefined }],
  ['a patch with no editable field', edit('d-a1', { receiptNumber: 'X' })],
  ['a one-letter donor name', edit('d-a1', { donorName: 'A' })],
  ['a fractional amount', edit('d-a1', { amountMinor: 12.5 })],
  ['a negative amount', edit('d-a1', { amountMinor: -100 })],
  ['an amount over GH₵ 9,999,999.99', edit('d-a1', { amountMinor: 1_000_000_000 })],
  ['an unknown donation type', edit('d-a1', { donationType: 'cheque' })],
  ['a non-text on-behalf-of', edit('d-a1', { onBehalfOf: 42 })],
  ['no reason', { ...edit('d-a1'), reason: undefined }],
  ['a reason under 10 characters', edit('d-a1', { amountMinor: 1 }, '  typo     ')],
];

for (const [label, body] of INVALID_EDITS) {
  test(
    `an edit with ${label} is rejected with 400`,
    withDonationEnv(async () => {
      const { result, calls } = await run({ as: 'so-a', body });

      assert.equal(result.status, 400);
      assert.equal(calls.updateRow, undefined);
    }),
  );
}

test(
  'an in-kind gift may have its amount cleared',
  withDonationEnv(async () => {
    const patch = { donationType: 'in_kind', amountMinor: null };
    const { result, store } = await run({ as: 'so-a', body: edit('d-a1', patch) });

    assert.equal(result.status, 200);
    assert.equal(store['donations-1']['d-a1'].amountMinor, null);
  }),
);

// ── soft delete / restore ───────────────────────────────────────────────────

test(
  'a Super Organizer soft-deletes with a reason: hidden, never erased, and audited',
  withDonationEnv(async () => {
    const { result, store } = await run({ as: 'so-a', body: softDelete('d-a1') });

    assert.equal(result.status, 200);
    const row = store['donations-1']['d-a1'];
    assert.ok(row.deletedAt);
    assert.equal(row.deletedBy, 'so-a');
    assert.equal(row.deletionReason, LONG_REASON);
    const [entry] = auditRows(store);
    assert.equal(entry.action, 'delete');
    assert.equal(entry.tenantId, 'tenant-a');
    assert.equal(entry.newValues.deletionReason, LONG_REASON);
  }),
);

test(
  'a delete needs a reason of at least 10 characters, and a deleted donation stays deleted',
  withDonationEnv(async () => {
    const short = await run({ as: 'so-a', body: softDelete('d-a1', 'dup') });
    const again = await run({ as: 'so-a', body: softDelete('d-a-deleted') });

    assert.equal(short.result.status, 400);
    assert.equal(again.result.status, 400);
    assert.equal(again.calls.updateRow, undefined);
  }),
);

test(
  'a Super Organizer restores a soft-deleted donation and the restore is audited',
  withDonationEnv(async () => {
    const { result, store } = await run({ as: 'so-a', body: restore('d-a-deleted') });

    assert.equal(result.status, 200);
    const row = store['donations-1']['d-a-deleted'];
    assert.equal(row.deletedAt, null);
    assert.equal(row.deletedBy, null);
    assert.equal(row.deletionReason, null);
    const [entry] = auditRows(store);
    assert.equal(entry.action, 'restore');
    assert.equal(entry.previousValues.deletionReason, 'Duplicate of FUN-d-a1');
    assert.equal(entry.tenantId, 'tenant-a');
  }),
);

test(
  'a live donation cannot be restored',
  withDonationEnv(async () => {
    const { result } = await run({ as: 'so-a', body: restore('d-a1') });

    assert.equal(result.status, 400);
  }),
);

test(
  'a failed write answers 502 and writes no audit entry',
  withDonationEnv(async () => {
    const { result, store } = await run({
      as: 'so-a',
      body: softDelete('d-a1'),
      failOn: { updateRow: true },
    });

    assert.equal(result.status, 502);
    assert.deepEqual(auditRows(store), []);
  }),
);

// ── who may write ───────────────────────────────────────────────────────────

const WRITES = [edit('d-a1'), softDelete('d-a1'), restore('d-a-deleted')];

for (const body of WRITES) {
  test(
    `${body.action}: co-Organizer, Operator, Admin and a suspended tenant are refused with 403`,
    withDonationEnv(async () => {
      for (const as of ['org-a', 'op-a', 'admin-1', 'so-s']) {
        const { result, calls } = await run({ as, body });
        assert.equal(result.status, 403, `${as} should be refused`);
        assert.equal(calls.updateRow, undefined);
      }
    }),
  );

  test(
    `${body.action}: another tenant's, an Admin Event's and a missing donation all answer 404`,
    withDonationEnv(async () => {
      const responses = [];
      for (const donationId of ['d-b1', 'd-admin', 'no-such-donation']) {
        const { result, calls } = await run({ as: 'so-a', body: { ...body, donationId } });
        assert.equal(calls.updateRow, undefined);
        responses.push(result);
      }

      assert.deepEqual(responses[0], { status: 404, body: { error: 'Donation not found' } });
      assert.deepEqual(responses[1], responses[0]);
      assert.deepEqual(responses[2], responses[0]);
    }),
  );
}

test(
  'an unauthenticated caller gets 401 before anything is read',
  withDonationEnv(async () => {
    const { result, calls } = await run({
      as: 'so-a',
      body: edit('d-a1'),
      headers: { 'x-appwrite-key': 'dynamic-key' },
    });

    assert.equal(result.status, 401);
    assert.equal(calls.getRow, undefined);
  }),
);

test(
  'a missing conflicts table variable is a 500, not a partial write',
  withDonationEnv(
    async () => {
      const { result, calls } = await run({ as: 'so-a', body: edit('d-a1') });

      assert.equal(result.status, 500);
      assert.equal(calls.updateRow, undefined);
    },
    { APPWRITE_DONATION_CONFLICTS_COLLECTION_ID: undefined },
  ),
);

test(
  'main.js routes editTenantDonation to the tenant donations module',
  withDonationEnv(async () => {
    const { ctx, store } = fakeContext({
      body: edit('d-a1'),
      as: 'so-a',
      store: seedDonationStore(),
    });

    const result = await main(ctx);

    assert.equal(result.status, 200);
    assert.equal(store['donations-1']['d-a1'].amountMinor, 70000);
  }),
);
