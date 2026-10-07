import { makeDonation } from '../data/models/donation-test-fixtures';
import { bucketsFor, periodRange } from './dashboard-period.util';
import {
  UNKNOWN_RECORDER,
  donationsInRange,
  donorCount,
  peakHour,
  raisedByHour,
  raisedByRecorder,
  raisedSeries,
  topEventsByRaised,
  typeSeries,
} from './donation-insights.util';

describe('donation insights', () => {
  const removed = makeDonation({ id: 'x', amountMinor: 99900, deletedAt: '2026-10-07T12:00:00Z' });
  const conflicted = makeDonation({ id: 'y', amountMinor: 88800, syncStatus: 'conflict' });

  it('keeps only the rows recorded within the range, start inclusive and end exclusive', () => {
    const range = { start: '2026-10-07T00:00:00.000Z', end: '2026-10-08T00:00:00.000Z' };
    const rows = [
      makeDonation({ id: 'a', recordedAt: '2026-10-07T00:00:00.000Z' }),
      makeDonation({ id: 'b', recordedAt: '2026-10-07T23:59:59.999Z' }),
      makeDonation({ id: 'c', recordedAt: '2026-10-08T00:00:00.000Z' }),
    ];

    expect(donationsInRange(rows, range).map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('totals each bucket from counted donations only', () => {
    const buckets = bucketsFor(periodRange('7d', new Date('2026-10-07T14:00:00Z')), '7d');
    const rows = [
      makeDonation({ id: 'a', amountMinor: 1000, recordedAt: '2026-10-01T08:00:00Z' }),
      makeDonation({ id: 'b', amountMinor: 2500, recordedAt: '2026-10-01T23:59:59Z' }),
      makeDonation({ id: 'c', amountMinor: 4000, recordedAt: '2026-10-07T09:00:00Z' }),
      makeDonation({ id: 'd', amountMinor: 7000, recordedAt: '2026-09-30T23:59:59Z' }),
      { ...removed, recordedAt: '2026-10-02T09:00:00Z' },
    ];

    expect(raisedSeries(rows, buckets)).toEqual([3500, 0, 0, 0, 0, 0, 4000]);
  });

  it('counts one donor per counted gift, in-kind included', () => {
    const rows = [
      makeDonation({ id: 'a' }),
      makeDonation({ id: 'b', amountMinor: null, donationType: 'in_kind' }),
      removed,
      conflicted,
    ];

    expect(donorCount(rows)).toBe(2);
  });

  describe('topEventsByRaised', () => {
    const events = [
      { id: 'e1', name: 'Odoi Funeral' },
      { id: 'e2', name: 'Asante Wedding' },
      { id: 'e3', name: 'Mensah Naming' },
      { id: 'e4', name: 'No Gifts Yet' },
    ];

    it('ranks events largest first, breaks ties by name and leaves out events with nothing', () => {
      const rows = [
        makeDonation({ id: 'a', eventId: 'e1', amountMinor: 5000 }),
        makeDonation({ id: 'b', eventId: 'e2', amountMinor: 3000 }),
        makeDonation({ id: 'c', eventId: 'e2', amountMinor: 2000 }),
        makeDonation({ id: 'd', eventId: 'e3', amountMinor: 9000 }),
        { ...removed, eventId: 'e4' },
      ];

      expect(topEventsByRaised(rows, events, 5)).toEqual([
        { id: 'e3', label: 'Mensah Naming', totalMinor: 9000, count: 1 },
        { id: 'e2', label: 'Asante Wedding', totalMinor: 5000, count: 2 },
        { id: 'e1', label: 'Odoi Funeral', totalMinor: 5000, count: 1 },
      ]);
    });

    it('keeps only the top n', () => {
      const rows = [
        makeDonation({ id: 'a', eventId: 'e1', amountMinor: 5000 }),
        makeDonation({ id: 'b', eventId: 'e3', amountMinor: 9000 }),
      ];

      expect(topEventsByRaised(rows, events, 1).map((t) => t.id)).toEqual(['e3']);
    });
  });

  describe('raisedByRecorder', () => {
    const names: Record<string, string> = { 'op-1': 'Kwesi Boateng', 'op-2': 'Efua Mensah' };
    const nameOf = (id: string) => names[id];

    it('groups by recorder, largest first, and keeps unresolved recorders apart', () => {
      const rows = [
        makeDonation({ id: 'a', recordedBy: 'op-1', amountMinor: 1000 }),
        makeDonation({ id: 'b', recordedBy: 'op-1', amountMinor: 2000 }),
        makeDonation({ id: 'c', recordedBy: 'op-2', amountMinor: 6000 }),
        makeDonation({ id: 'd', recordedBy: 'gone-1', amountMinor: 500 }),
        makeDonation({ id: 'e', recordedBy: 'gone-2', amountMinor: 400 }),
        { ...conflicted, recordedBy: 'op-1' },
      ];

      expect(raisedByRecorder(rows, nameOf, 10)).toEqual([
        { id: 'op-2', label: 'Efua Mensah', totalMinor: 6000, count: 1 },
        { id: 'op-1', label: 'Kwesi Boateng', totalMinor: 3000, count: 2 },
        { id: 'gone-1', label: UNKNOWN_RECORDER, totalMinor: 500, count: 1 },
        { id: 'gone-2', label: UNKNOWN_RECORDER, totalMinor: 400, count: 1 },
      ]);
    });

    it('keeps a recorder who logged only in-kind gifts, at the bottom', () => {
      const rows = [
        makeDonation({ id: 'a', recordedBy: 'op-1', amountMinor: 1000 }),
        makeDonation({ id: 'b', recordedBy: 'op-2', amountMinor: null, donationType: 'in_kind' }),
      ];

      expect(raisedByRecorder(rows, nameOf, 1)).toHaveLength(1);
      expect(raisedByRecorder(rows, nameOf, 5)[1]).toEqual({
        id: 'op-2',
        label: 'Efua Mensah',
        totalMinor: 0,
        count: 1,
      });
    });
  });

  it('totals each Accra hour and names the peak', () => {
    const rows = [
      makeDonation({ id: 'a', amountMinor: 1000, recordedAt: '2026-10-07T09:05:00Z' }),
      makeDonation({ id: 'b', amountMinor: 3000, recordedAt: '2026-10-08T14:59:59Z' }),
      makeDonation({ id: 'c', amountMinor: 1500, recordedAt: '2026-10-07T09:55:00Z' }),
    ];
    const byHour = raisedByHour(rows);

    expect(byHour).toHaveLength(24);
    expect(byHour[9]).toBe(2500);
    expect(byHour[14]).toBe(3000);
    expect(peakHour(rows)).toBe(14);
    expect(peakHour([])).toBeNull();
  });

  describe('typeSeries', () => {
    const rows = [
      makeDonation({ id: 'a', amountMinor: 3000 }),
      makeDonation({ id: 'b', amountMinor: 2000, donationType: 'mobile_money' }),
      makeDonation({ id: 'c', amountMinor: null, donationType: 'in_kind' }),
      makeDonation({ id: 'd', amountMinor: null, donationType: 'in_kind' }),
      { ...removed, donationType: 'mobile_money' as const },
    ];

    it('gives one arc per type by amount, in the fixed slot order', () => {
      expect(typeSeries(rows)).toEqual([
        { key: 'cash', label: 'Cash', values: [3000], colorToken: '--series-1' },
        { key: 'mobile_money', label: 'Mobile Money', values: [2000], colorToken: '--series-2' },
        { key: 'in_kind', label: 'In-Kind', values: [0], colorToken: '--series-3' },
      ]);
    });

    it('can count gifts instead, so in-kind shows up', () => {
      expect(typeSeries(rows, 'count').map((s) => s.values[0])).toEqual([1, 1, 2]);
    });
  });
});
