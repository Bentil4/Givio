import type { Donation } from './donation';

/** A synced cash donation, for specs that only care about one or two of its fields. */
export const makeDonation = (overrides: Partial<Donation> = {}): Donation => ({
  id: 'd1',
  eventId: 'e1',
  receiptNumber: 'FUN-0001',
  donorName: 'Ama Owusu',
  amountMinor: 50000,
  donationType: 'cash',
  donorPhone: '+233201234567',
  recordedBy: 'op-1',
  recordedAt: '2026-10-10T10:00:00.000Z',
  syncStatus: 'synced',
  deletedAt: null,
  ...overrides,
});
