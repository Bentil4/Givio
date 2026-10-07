import { makeDonation } from '../data/models/donation-test-fixtures';
import { donationStats, giftAverages } from './donation-breakdown.util';

describe('donation breakdown', () => {
  const donations = [
    makeDonation({ id: 'a', amountMinor: 30000 }),
    makeDonation({ id: 'b', amountMinor: 50000, donationType: 'mobile_money' }),
    makeDonation({ id: 'c', amountMinor: 20000, onBehalfOf: 'The Asante Family' }),
    makeDonation({ id: 'd', amountMinor: null, donationType: 'in_kind' }),
  ];

  it('headlines the total, donor count, average with median, and largest gift', () => {
    const stats = donationStats(donations, '10 Oct 2026');

    expect(stats.map((s) => s.key)).toEqual([
      'Total raised',
      'Donors',
      'Average gift',
      'Largest gift',
    ]);
    expect(stats[0].sub).toBe('4 validated records');
    expect(stats[1]).toEqual({ key: 'Donors', value: '4', sub: '10 Oct 2026' });
    expect(stats[2].sub).toBe('Median GH₵ 300.00');
    expect(stats[3].sub).toBe('Ama Owusu');
  });

  it('falls back to dashes before any cash gift exists', () => {
    const stats = donationStats([makeDonation({ amountMinor: null })], '');

    expect(stats[1].sub).toBe('this event');
    expect(stats[2]).toEqual({ key: 'Average gift', value: '—', sub: 'no cash gifts yet' });
    expect(stats[3].value).toBe('—');
  });

  it('averages and takes the median of the gifts that carry an amount', () => {
    expect(giftAverages(donations)).toEqual({ averageMinor: 33333, medianMinor: 30000 });
  });

  it('has no average or median when every gift is in kind', () => {
    const inKind = [makeDonation({ amountMinor: null, donationType: 'in_kind' })];

    expect(giftAverages(inKind)).toEqual({ averageMinor: null, medianMinor: null });
  });
});
