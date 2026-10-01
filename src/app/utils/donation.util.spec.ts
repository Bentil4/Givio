import { countedDonations, totalMinor, type CountableDonation } from './donation.util';

const donation = (overrides: Partial<CountableDonation> = {}): CountableDonation => ({
  amountMinor: 1000,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
});

describe('donation totals', () => {
  const donations = [
    donation({ amountMinor: 50000 }),
    donation({ amountMinor: null }),
    donation({ syncStatus: 'pending' }),
    donation({ deletedAt: '2026-10-01T00:00:00.000Z' }),
    donation({ syncStatus: 'conflict' }),
    donation({ syncStatus: 'failed' }),
  ];

  it('counts every donation except soft-deleted, in-conflict and rejected ones', () => {
    expect(countedDonations(donations)).toHaveLength(3);
  });

  it('totals the counted donations in minor units, an in-kind gift adding nothing', () => {
    expect(totalMinor(donations)).toBe(51000);
  });
});
