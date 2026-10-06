import { handleTenantDonationsRequest } from '../../src/tenant-donations.js';
import { fakeContext, seedStore, withEnv } from './tenant-events-fixtures.js';

// A Super Organizer's donation corrections and sync conflicts, run against the same in-memory
// store as the Organizer event actions — tenant-a's and tenant-b's Events, plus an Admin one.

const RECORDED_PERMISSIONS = ['read("label:admin")', 'update("label:admin")', 'read("user:so-a")'];

const donation = (id, eventId, extra) => ({
  $id: id,
  id,
  eventId,
  receiptNumber: `FUN-${id}`,
  donorName: 'Ama Owusu',
  amountMinor: 50000,
  donationType: 'cash',
  onBehalfOf: null,
  donorPhone: '+233201234567',
  recordedBy: 'op-a',
  recordedAt: '2026-10-10T10:00:00.000Z',
  syncStatus: 'synced',
  deletedAt: null,
  $permissions: RECORDED_PERMISSIONS,
  ...extra,
});

const conflict = (id, eventId, extra) => ({
  $id: id,
  eventId,
  receiptNumber: `FUN-${id}`,
  localVersion: JSON.stringify({ ...plainDonation(`d-${id}`, eventId), amountMinor: 70000 }),
  serverVersion: JSON.stringify(plainDonation(`d-${id}`, eventId)),
  detectedAt: '2026-10-10T11:00:00.000Z',
  resolvedAt: null,
  ...extra,
});

function plainDonation(id, eventId) {
  const fields = Object.entries(donation(id, eventId)).filter(([key]) => !key.startsWith('$'));
  return Object.fromEntries(fields);
}

const deletedFields = {
  deletedAt: '2026-10-11T09:00:00.000Z',
  deletedBy: 'admin-1',
  deletionReason: 'Duplicate of FUN-d-a1',
};

export function seedDonationStore() {
  const store = seedStore();
  store['donations-1'] = {
    'd-a1': donation('d-a1', 'event-a1'),
    'd-a-deleted': donation('d-a-deleted', 'event-a1', deletedFields),
    'd-b1': donation('d-b1', 'event-b1'),
    'd-admin': donation('d-admin', 'event-admin'),
    'd-c-a1': donation('d-c-a1', 'event-a1'),
  };
  store['conflicts-1'] = {
    'c-a1': conflict('c-a1', 'event-a1'),
    'c-a-done': conflict('c-a-done', 'event-a1', { resolvedAt: '2026-10-12T08:00:00.000Z' }),
    'c-b1': conflict('c-b1', 'event-b1'),
  };
  return store;
}

export const withDonationEnv = (fn, overrides = {}) =>
  withEnv(fn, { APPWRITE_DONATION_CONFLICTS_COLLECTION_ID: 'conflicts-1', ...overrides });

export async function run({ as, body, store = seedDonationStore(), ...options }) {
  const context = fakeContext({ body, as, store, ...options });
  const result = await handleTenantDonationsRequest(context.ctx);
  return { result, ...context };
}

export const LONG_REASON = 'Donor called to confirm the transfer was GH₵ 700.';
