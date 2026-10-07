import { makeDonation } from '../data/models/donation-test-fixtures';
import { donationStats, donationTypeSlices } from './donation-breakdown.util';

describe('donation breakdown', () => {
  const donations = [
    makeDonation({ id: 'a', amountMinor: 30000 }),
    makeDonation({ id: 'b', amountMinor: 50000, donationType: 'mobile_money' }),
    makeDonation({ id: 'c', amountMinor: 20000, onBehalfOf: 'The Asante Family' }),
    makeDonation({ id: 'd', amountMinor: null, donationType: 'in_kind' }),
  ];

  it('gives each type its share of the total, with cumulative wedge offsets', () => {
    const slices = donationTypeSlices(donations);

    expect(slices.map((s) => [s.type, s.percent, s.from, s.to])).toEqual([
      ['cash', 50, 0, 50],
      ['mobile_money', 50, 50, 100],
      ['in_kind', 0, 100, 100],
    ]);
    expect(slices[0].label).toBe('Cash');
    expect(slices[0].valueLabel).toBe('GH₵ 500.00');
  });

  it('reports zero shares when nothing has been given', () => {
    expect(donationTypeSlices([]).every((s) => s.percent === 0)).toBe(true);
  });

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
});
