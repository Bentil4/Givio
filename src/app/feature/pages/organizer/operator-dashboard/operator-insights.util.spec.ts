import { makeDonation } from '../../../../data/models/donation-test-fixtures';
import {
  RECENT_DONATION_LIMIT,
  donationsForPeriod,
  hourlyChart,
  myRecentDonations,
  operatorKpis,
} from './operator-insights.util';

const NOW = new Date('2026-10-07T14:30:00Z');

describe('operator insights', () => {
  const today = [
    makeDonation({ id: 't1', amountMinor: 10000, recordedAt: '2026-10-07T09:15:00Z' }),
    makeDonation({
      id: 't2',
      amountMinor: 20000,
      recordedAt: '2026-10-07T14:05:00Z',
      recordedBy: 'op-2',
    }),
    makeDonation({
      id: 't3',
      amountMinor: null,
      donationType: 'in_kind',
      recordedAt: '2026-10-07T11:00:00Z',
    }),
    makeDonation({
      id: 'tx',
      amountMinor: 99900,
      recordedAt: '2026-10-07T10:00:00Z',
      deletedAt: 'x',
    }),
  ];
  // Yesterday before 14:30 counts; yesterday after 14:30 is past "the same time".
  const yesterday = [
    makeDonation({ id: 'y1', amountMinor: 20000, recordedAt: '2026-10-06T10:00:00Z' }),
    makeDonation({ id: 'y2', amountMinor: 50000, recordedAt: '2026-10-06T18:00:00Z' }),
  ];
  const donations = [...today, ...yesterday];

  describe('KPIs for Today', () => {
    const kpis = operatorKpis({ donations, period: 'today', now: NOW }, 'op-1');

    it('totals only today, leaving out removed records', () => {
      expect(kpis.raisedMinor).toBe(30000);
      expect(kpis.donors).toBe(3);
    });

    it('compares with yesterday up to the same time', () => {
      expect(kpis.raisedDelta).toEqual({
        direction: 'up',
        percent: 50,
        comparisonLabel: 'vs same time yesterday',
      });
      expect(kpis.donorsDelta).toEqual({
        direction: 'up',
        percent: 200,
        comparisonLabel: 'vs same time yesterday',
      });
    });

    it("counts the operator's own recordings, in-kind included", () => {
      expect(kpis.myCount).toBe(2);
      expect(kpis.myRaisedMinor).toBe(10000);
    });
  });

  it('reads a first day as "New" rather than an infinite rise', () => {
    const kpis = operatorKpis({ donations: today, period: 'today', now: NOW }, 'op-1');

    expect(kpis.raisedDelta?.comparisonLabel).toBe('New');
  });

  it.each(['event', 'all'] as const)('covers every date and has no delta for %s', (period) => {
    const kpis = operatorKpis({ donations, period, now: NOW }, 'op-1');

    expect(kpis.raisedMinor).toBe(100000);
    expect(kpis.raisedDelta).toBeNull();
    expect(kpis.donorsDelta).toBeNull();
    expect(kpis.myCount).toBe(4);
  });

  it('keeps every donation outside Today', () => {
    expect(donationsForPeriod({ donations, period: 'event', now: NOW })).toHaveLength(6);
    expect(donationsForPeriod({ donations, period: 'today', now: NOW })).toHaveLength(4);
  });

  describe('hourly chart', () => {
    it("shows today's hours so far, the current one marked", () => {
      const chart = hourlyChart({ donations, period: 'today', now: NOW });

      expect(chart.title).toBe("Today's pace");
      expect(chart.labels).toHaveLength(15);
      expect(chart.labels[14]).toBe('14:00 (now)');
      expect(chart.values[9]).toBe(10000);
      expect(chart.values[14]).toBe(20000);
    });

    it('shows the busiest hours of the day outside Today, the busiest marked', () => {
      const chart = hourlyChart({ donations, period: 'all', now: NOW });

      expect(chart.title).toBe('Busiest hours');
      expect(chart.labels).toHaveLength(24);
      expect(chart.labels[18]).toBe('18:00 (busiest)');
      expect(chart.values[10]).toBe(20000);
    });
  });

  describe('my recent donations', () => {
    it("lists only the operator's own, newest first, without removed ones", () => {
      expect(myRecentDonations(donations, 'op-1').map((d) => d.id)).toEqual([
        't3',
        't1',
        'y2',
        'y1',
      ]);
    });

    it(`stops at ${RECENT_DONATION_LIMIT}`, () => {
      const many = Array.from({ length: 9 }, (_, i) =>
        makeDonation({ id: `m${i}`, recordedAt: `2026-10-07T0${i}:00:00Z` }),
      );

      const recent = myRecentDonations(many, 'op-1');

      expect(recent).toHaveLength(RECENT_DONATION_LIMIT);
      expect(recent[0].id).toBe('m8');
    });
  });
});
