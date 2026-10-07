/**
 * The Operator dashboard's figures, derived from the donations of the Events in scope. Every
 * total goes through the shared counting rule, so removed, in-conflict and rejected records
 * never reach a KPI or a chart.
 */
import type { Donation } from '../../../../data/models/donation';
import {
  bucketsFor,
  comparisonLabelFor,
  periodRange,
  previousRange,
  type DateRange,
} from '../../../../utils/dashboard-period.util';
import {
  donationsInRange,
  donorCount,
  peakHour,
  raisedByHour,
  raisedSeries,
} from '../../../../utils/donation-insights.util';
import { countedDonations, totalMinor } from '../../../../utils/donation.util';
import { compareToPrevious, type KpiDelta } from '../../../../utils/trend.util';
import type { OperatorPeriod } from './operator-period';

/** Where the dashboard's donation figures are: still loading, shown, or unreadable. */
export type OperatorDataState = 'loading' | 'ready' | 'error';

export interface OperatorInsightSource {
  /** Every donation of the Events in scope, any date. */
  donations: readonly Donation[];
  period: OperatorPeriod;
  now: Date;
}

export interface OperatorKpis {
  raisedMinor: number;
  /** Today only — an Event or all Events has no equal-length stretch before it. */
  raisedDelta: KpiDelta | null;
  donors: number;
  donorsDelta: KpiDelta | null;
  myCount: number;
  myRaisedMinor: number;
}

/** A single-series bar chart of money raised per hour. */
export interface HourlyChart {
  title: string;
  subtitle: string;
  labels: string[];
  values: number[];
}

export const RECENT_DONATION_LIMIT = 6;

const SAME_TIME_YESTERDAY = comparisonLabelFor('today') ?? 'vs same time yesterday';

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

/** The donations a period covers: today's for Today, all of them otherwise. */
export function donationsForPeriod(source: OperatorInsightSource): Donation[] {
  if (source.period !== 'today') return [...source.donations];
  return donationsInRange(source.donations, todayRange(source.now));
}

export function operatorKpis(source: OperatorInsightSource, userId: string): OperatorKpis {
  const current = countedDonations(donationsForPeriod(source));
  const mine = current.filter((donation) => donation.recordedBy === userId);
  return {
    raisedMinor: totalMinor(current),
    donors: donorCount(current),
    myCount: mine.length,
    myRaisedMinor: totalMinor(mine),
    ...todayDeltas(source, current),
  };
}

/**
 * Today: money per hour so far, the current hour marked "(now)". Otherwise: which hours of the
 * day have been busiest across the whole period, the busiest one marked.
 */
export function hourlyChart(source: OperatorInsightSource): HourlyChart {
  if (source.period === 'today') return todayPace(source);
  return busiestHours(donationsForPeriod(source));
}

/** The Operator's own latest recordings, newest first — pending ones included. */
export function myRecentDonations(donations: readonly Donation[], userId: string): Donation[] {
  return donations
    .filter((donation) => donation.recordedBy === userId && !donation.deletedAt)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, RECENT_DONATION_LIMIT);
}

function todayDeltas(
  source: OperatorInsightSource,
  current: readonly Donation[],
): Pick<OperatorKpis, 'raisedDelta' | 'donorsDelta'> {
  if (source.period !== 'today') return { raisedDelta: null, donorsDelta: null };
  const yesterday = donationsInRange(source.donations, previousRange(todayRange(source.now)));
  return {
    raisedDelta: compareToPrevious(totalMinor(current), totalMinor(yesterday), SAME_TIME_YESTERDAY),
    donorsDelta: compareToPrevious(donorCount(current), donorCount(yesterday), SAME_TIME_YESTERDAY),
  };
}

function todayPace(source: OperatorInsightSource): HourlyChart {
  const buckets = bucketsFor(todayRange(source.now), 'today');
  const labels = buckets.map((bucket) => bucket.label);
  return {
    title: "Today's pace",
    subtitle: 'Raised per hour, Accra time',
    labels: labels.map((label, i) => (i === labels.length - 1 ? `${label} (now)` : label)),
    values: raisedSeries(source.donations, buckets),
  };
}

function busiestHours(donations: readonly Donation[]): HourlyChart {
  const busiest = peakHour(donations);
  return {
    title: 'Busiest hours',
    subtitle: 'Raised per hour of the day, Accra time',
    labels: HOUR_LABELS.map((label, hour) => (hour === busiest ? `${label} (busiest)` : label)),
    values: raisedByHour(donations),
  };
}

function todayRange(now: Date): DateRange {
  return periodRange('today', now);
}
