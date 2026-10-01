/**
 * Story 8.5 (FR-22): a settlement period is one calendar month in Africa/Accra time. Accra is
 * UTC+0 all year with no daylight saving, so UTC calendar arithmetic gives its month
 * boundaries exactly — no time-zone library needed.
 */
export const SETTLEMENT_TIME_ZONE = 'Africa/Accra';

export interface SettlementPeriod {
  /** `YYYY-MM` — the month picker's value and the export file's date stamp. */
  key: string;
  /** e.g. `November 2026`. */
  label: string;
  /** Inclusive start, ISO 8601 UTC. */
  startsAt: string;
  /** Exclusive end — the first instant of the following month. */
  endsAt: string;
}

/** Newest first; empty until the first full calendar month after approval has ended. */
export function completedSettlementPeriods(approvedAt: string, now: Date): SettlementPeriod[] {
  const periods: SettlementPeriod[] = [];
  const currentMonthStart = monthStart(now);
  let start = firstFullMonthStart(approvedAt);
  while (start < currentMonthStart) {
    periods.unshift(periodStartingAt(start));
    start = addMonths(start, 1);
  }
  return periods;
}

/** The first calendar month the tenant was approved for in full. */
export function firstSettlementPeriod(approvedAt: string): SettlementPeriod {
  return periodStartingAt(firstFullMonthStart(approvedAt));
}

export function isWithinSettlementPeriod(timestamp: string, period: SettlementPeriod): boolean {
  const time = Date.parse(timestamp);
  return time >= Date.parse(period.startsAt) && time < Date.parse(period.endsAt);
}

/** e.g. `1 December 2026`, read in Accra time. */
export function formatSettlementDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: SETTLEMENT_TIME_ZONE,
  });
}

function firstFullMonthStart(approvedAt: string): Date {
  const approved = new Date(approvedAt);
  const start = monthStart(approved);
  return start.getTime() === approved.getTime() ? start : addMonths(start, 1);
}

function periodStartingAt(start: Date): SettlementPeriod {
  return {
    key: start.toISOString().slice(0, 7),
    label: start.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: SETTLEMENT_TIME_ZONE,
    }),
    startsAt: start.toISOString(),
    endsAt: addMonths(start, 1).toISOString(),
  };
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}
