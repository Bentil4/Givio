import { SETTLEMENT_TIME_ZONE, addMonths, monthStart } from './settlement-period.util';

/**
 * A dashboard's time range, read in Africa/Accra time. Accra is UTC+0 all year with no daylight
 * saving, so UTC calendar arithmetic gives its day and month boundaries exactly.
 */
export type DashboardPeriod = 'today' | '7d' | '30d' | '90d' | 'all';

export const DASHBOARD_PERIODS: readonly DashboardPeriod[] = ['today', '7d', '30d', '90d', 'all'];

export interface DateRange {
  /** Inclusive, ISO 8601 UTC. */
  start: string;
  /** Exclusive, ISO 8601 UTC. */
  end: string;
}

/** One x-axis step of a time chart — an hour, day, week or month. */
export interface PeriodBucket extends DateRange {
  key: string;
  /** e.g. `09:00`, `7 Oct` or `Oct 2026`. */
  label: string;
}

type BucketUnit = 'hour' | 'day' | 'week' | 'month';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const FIXED_STEP_MS = { hour: HOUR_MS, day: DAY_MS, week: 7 * DAY_MS } as const;

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

const BUCKET_UNITS: Record<DashboardPeriod, BucketUnit> = {
  today: 'hour',
  '7d': 'day',
  '30d': 'day',
  '90d': 'week',
  all: 'month',
};

const COMPARISON_LABELS: Record<DashboardPeriod, string | null> = {
  today: 'vs same time yesterday',
  '7d': 'vs previous 7 days',
  '30d': 'vs previous 30 days',
  '90d': 'vs previous 90 days',
  all: null,
};

const LABEL_FORMATS: Record<BucketUnit, Intl.DateTimeFormatOptions> = {
  hour: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  day: { day: 'numeric', month: 'short' },
  week: { day: 'numeric', month: 'short' },
  month: { month: 'short', year: 'numeric' },
};

/**
 * The range a period covers, ending now: Today from Accra midnight, N days as N calendar days
 * including today, and All time from the day of `earliest` (today when nothing exists yet).
 */
export function periodRange(period: DashboardPeriod, now: Date, earliest?: string): DateRange {
  return { start: periodStart(period, now, earliest).toISOString(), end: now.toISOString() };
}

/**
 * The same stretch one period earlier, moved back by whole days so it covers the same hours:
 * Today compares with yesterday up to the same time, 7 days with the 7 days before them.
 */
export function previousRange(range: DateRange): DateRange {
  const span = Date.parse(range.end) - Date.parse(range.start);
  const shift = Math.max(1, Math.ceil(span / DAY_MS)) * DAY_MS;
  return { start: shiftedIso(range.start, -shift), end: shiftedIso(range.end, -shift) };
}

/** e.g. `vs previous 7 days`; null for All time, which has nothing before it to compare with. */
export function comparisonLabelFor(period: DashboardPeriod): string | null {
  return COMPARISON_LABELS[period];
}

export function isWithinRange(timestamp: string, range: DateRange): boolean {
  const time = Date.parse(timestamp);
  return time >= Date.parse(range.start) && time < Date.parse(range.end);
}

/**
 * The x-axis steps for a period: hours for Today, days up to 30 days, weeks for 90 days and
 * months for All time. The last bucket may run past `range.end` — it is the current one.
 */
export function bucketsFor(range: DateRange, period: DashboardPeriod): PeriodBucket[] {
  const unit = BUCKET_UNITS[period];
  const end = Date.parse(range.end);
  const buckets = [bucketStartingAt(alignToUnit(new Date(range.start), unit), unit)];
  while (Date.parse(lastOf(buckets).end) < end) {
    buckets.push(bucketStartingAt(new Date(lastOf(buckets).end), unit));
  }
  return buckets;
}

/** The bucket a timestamp falls in, or -1 when it is outside all of them. */
export function bucketIndexOf(timestamp: string, buckets: readonly PeriodBucket[]): number {
  return buckets.findIndex((bucket) => isWithinRange(timestamp, bucket));
}

/** The remembered choice, or null when none (or an unknown one) is stored. */
export function readStoredPeriod<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const stored = localStorage.getItem(key);
    return allowed.find((period) => period === stored) ?? null;
  } catch {
    // Storage can be blocked (private mode, site-data policy); the default period applies.
    return null;
  }
}

export function storePeriod(key: string, period: string): void {
  try {
    localStorage.setItem(key, period);
  } catch {
    // Remembering the choice is a convenience — a blocked store must not break the dashboard.
  }
}

function periodStart(period: DashboardPeriod, now: Date, earliest?: string): Date {
  const today = dayStart(now);
  if (period === 'today') return today;
  if (period === 'all') return earliest ? dayStart(new Date(earliest)) : today;
  return addDays(today, 1 - PERIOD_DAYS[period]);
}

function bucketStartingAt(start: Date, unit: BucketUnit): PeriodBucket {
  return {
    key: start.toISOString(),
    label: start.toLocaleString('en-GB', {
      ...LABEL_FORMATS[unit],
      timeZone: SETTLEMENT_TIME_ZONE,
    }),
    start: start.toISOString(),
    end: nextBoundary(start, unit).toISOString(),
  };
}

function alignToUnit(date: Date, unit: BucketUnit): Date {
  if (unit === 'hour') return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
  return unit === 'month' ? monthStart(date) : dayStart(date);
}

function nextBoundary(start: Date, unit: BucketUnit): Date {
  if (unit === 'month') return addMonths(start, 1);
  return new Date(start.getTime() + FIXED_STEP_MS[unit]);
}

function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function shiftedIso(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function lastOf<T>(items: readonly T[]): T {
  return items[items.length - 1];
}
