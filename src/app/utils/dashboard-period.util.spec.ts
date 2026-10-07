import {
  DASHBOARD_PERIODS,
  bucketIndexOf,
  bucketsFor,
  comparisonLabelFor,
  isWithinRange,
  periodRange,
  previousRange,
  readStoredPeriod,
  storePeriod,
} from './dashboard-period.util';

describe('dashboard periods (Africa/Accra)', () => {
  const now = new Date('2026-10-07T14:25:00.000Z');

  describe('periodRange', () => {
    it('starts Today at Accra midnight and ends now', () => {
      expect(periodRange('today', now)).toEqual({
        start: '2026-10-07T00:00:00.000Z',
        end: '2026-10-07T14:25:00.000Z',
      });
    });

    it('counts N days as N calendar days including today', () => {
      expect(periodRange('7d', now).start).toBe('2026-10-01T00:00:00.000Z');
      expect(periodRange('30d', now).start).toBe('2026-09-08T00:00:00.000Z');
      expect(periodRange('90d', now).start).toBe('2026-07-10T00:00:00.000Z');
    });

    it('starts All time on the day of the earliest record, or today when there is none', () => {
      expect(periodRange('all', now, '2025-03-15T18:00:00.000Z').start).toBe(
        '2025-03-15T00:00:00.000Z',
      );
      expect(periodRange('all', now).start).toBe('2026-10-07T00:00:00.000Z');
    });

    it('treats the last second before midnight as the same Accra day', () => {
      const lateEvening = new Date('2026-10-07T23:59:59.999Z');
      expect(periodRange('today', lateEvening).start).toBe('2026-10-07T00:00:00.000Z');
      expect(periodRange('today', new Date('2026-10-08T00:00:00.000Z')).start).toBe(
        '2026-10-08T00:00:00.000Z',
      );
    });
  });

  describe('previousRange', () => {
    it('compares Today with yesterday up to the same time', () => {
      expect(previousRange(periodRange('today', now))).toEqual({
        start: '2026-10-06T00:00:00.000Z',
        end: '2026-10-06T14:25:00.000Z',
      });
    });

    it('compares 7 days with the 7 days before them, over the same hours', () => {
      expect(previousRange(periodRange('7d', now))).toEqual({
        start: '2026-09-24T00:00:00.000Z',
        end: '2026-09-30T14:25:00.000Z',
      });
    });

    it('moves a whole-day range back by exactly its length', () => {
      const range = { start: '2026-10-01T00:00:00.000Z', end: '2026-10-08T00:00:00.000Z' };
      expect(previousRange(range)).toEqual({
        start: '2026-09-24T00:00:00.000Z',
        end: '2026-10-01T00:00:00.000Z',
      });
    });
  });

  it('labels the comparison for every period but All time', () => {
    expect(comparisonLabelFor('today')).toBe('vs same time yesterday');
    expect(comparisonLabelFor('30d')).toBe('vs previous 30 days');
    expect(comparisonLabelFor('all')).toBeNull();
  });

  it('includes a range start and excludes its end', () => {
    const range = { start: '2026-10-07T00:00:00.000Z', end: '2026-10-08T00:00:00.000Z' };

    expect(isWithinRange('2026-10-07T00:00:00.000Z', range)).toBe(true);
    expect(isWithinRange('2026-10-07T23:59:59.999Z', range)).toBe(true);
    expect(isWithinRange('2026-10-08T00:00:00.000Z', range)).toBe(false);
    expect(isWithinRange('2026-10-06T23:59:59.999Z', range)).toBe(false);
  });

  describe('bucketsFor', () => {
    it('steps Today by the hour up to the current one', () => {
      const buckets = bucketsFor(periodRange('today', now), 'today');

      expect(buckets).toHaveLength(15);
      expect(buckets[0]).toEqual({
        key: '2026-10-07T00:00:00.000Z',
        label: '00:00',
        start: '2026-10-07T00:00:00.000Z',
        end: '2026-10-07T01:00:00.000Z',
      });
      expect(buckets[14].label).toBe('14:00');
    });

    it('steps 7 and 30 days by the day', () => {
      const week = bucketsFor(periodRange('7d', now), '7d');

      expect(week.map((b) => b.label)).toEqual([
        '1 Oct',
        '2 Oct',
        '3 Oct',
        '4 Oct',
        '5 Oct',
        '6 Oct',
        '7 Oct',
      ]);
      expect(bucketsFor(periodRange('30d', now), '30d')).toHaveLength(30);
    });

    it('steps 90 days by the week from the range start', () => {
      const buckets = bucketsFor(periodRange('90d', now), '90d');

      expect(buckets).toHaveLength(13);
      expect(buckets[0].label).toBe('10 Jul');
      expect(buckets[1].start).toBe('2026-07-17T00:00:00.000Z');
    });

    it('steps All time by the calendar month, across a year end', () => {
      const range = periodRange('all', now, '2025-11-20T10:00:00.000Z');
      const buckets = bucketsFor(range, 'all');

      expect(buckets.map((b) => b.label)).toEqual([
        'Nov 2025',
        'Dec 2025',
        'Jan 2026',
        'Feb 2026',
        'Mar 2026',
        'Apr 2026',
        'May 2026',
        'Jun 2026',
        'Jul 2026',
        'Aug 2026',
        'Sept 2026',
        'Oct 2026',
      ]);
      expect(buckets[0].start).toBe('2025-11-01T00:00:00.000Z');
      expect(buckets[1].start).toBe('2025-12-01T00:00:00.000Z');
    });

    it('still has one bucket at the very first instant of a day', () => {
      const midnight = new Date('2026-10-07T00:00:00.000Z');
      expect(bucketsFor(periodRange('today', midnight), 'today')).toHaveLength(1);
    });
  });

  it('finds the bucket a timestamp falls in, with edges belonging to the later bucket', () => {
    const buckets = bucketsFor(periodRange('7d', now), '7d');

    expect(bucketIndexOf('2026-10-01T00:00:00.000Z', buckets)).toBe(0);
    expect(bucketIndexOf('2026-10-01T23:59:59.999Z', buckets)).toBe(0);
    expect(bucketIndexOf('2026-10-02T00:00:00.000Z', buckets)).toBe(1);
    expect(bucketIndexOf('2026-09-30T23:59:59.999Z', buckets)).toBe(-1);
  });

  describe('stored choice', () => {
    afterEach(() => {
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('round-trips a known period', () => {
      storePeriod('dash.period', '30d');
      expect(readStoredPeriod('dash.period', DASHBOARD_PERIODS)).toBe('30d');
    });

    it('ignores a missing or unknown value', () => {
      expect(readStoredPeriod('dash.period', DASHBOARD_PERIODS)).toBeNull();
      localStorage.setItem('dash.period', 'yesterday');
      expect(readStoredPeriod('dash.period', DASHBOARD_PERIODS)).toBeNull();
    });

    it('survives blocked storage', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      expect(() => storePeriod('dash.period', '7d')).not.toThrow();
      expect(readStoredPeriod('dash.period', DASHBOARD_PERIODS)).toBeNull();
    });
  });
});
