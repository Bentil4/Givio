import {
  completedSettlementPeriods,
  firstSettlementPeriod,
  formatSettlementDate,
  isWithinSettlementPeriod,
} from './settlement-period.util';

describe('settlement periods (calendar months, Africa/Accra)', () => {
  const approvedMidOctober = '2026-10-15T09:30:00.000Z';

  it('has no completed period until the first full month after approval has ended', () => {
    expect(
      completedSettlementPeriods(approvedMidOctober, new Date('2026-10-31T23:59:59Z')),
    ).toEqual([]);
    expect(
      completedSettlementPeriods(approvedMidOctober, new Date('2026-11-30T23:59:59Z')),
    ).toEqual([]);
  });

  it('opens November on 1 December for a tenant approved on 15 October', () => {
    const periods = completedSettlementPeriods(
      approvedMidOctober,
      new Date('2026-12-01T00:00:00Z'),
    );

    expect(periods).toEqual([
      {
        key: '2026-11',
        label: 'November 2026',
        startsAt: '2026-11-01T00:00:00.000Z',
        endsAt: '2026-12-01T00:00:00.000Z',
      },
    ]);
  });

  it('lists every completed month newest first, across a year boundary', () => {
    const periods = completedSettlementPeriods(
      approvedMidOctober,
      new Date('2027-02-10T12:00:00Z'),
    );

    expect(periods.map((p) => p.key)).toEqual(['2027-01', '2026-12', '2026-11']);
  });

  it('counts the approval month itself when approval fell exactly on its first instant', () => {
    expect(firstSettlementPeriod('2026-10-01T00:00:00.000Z').key).toBe('2026-10');
    expect(firstSettlementPeriod(approvedMidOctober).key).toBe('2026-11');
  });

  it('treats the period start as inclusive and its end as exclusive', () => {
    const november = firstSettlementPeriod(approvedMidOctober);

    expect(isWithinSettlementPeriod('2026-11-01T00:00:00.000Z', november)).toBe(true);
    expect(isWithinSettlementPeriod('2026-11-30T23:59:59.999Z', november)).toBe(true);
    expect(isWithinSettlementPeriod('2026-12-01T00:00:00.000Z', november)).toBe(false);
    expect(isWithinSettlementPeriod('2026-10-31T23:59:59.999Z', november)).toBe(false);
  });

  it('formats dates in Accra time', () => {
    expect(formatSettlementDate('2026-12-01T00:00:00.000Z')).toBe('1 December 2026');
  });
});
