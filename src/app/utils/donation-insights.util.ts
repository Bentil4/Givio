/**
 * Dashboard aggregates over donations. Every aggregate applies the shared counting rule
 * (countedDonations) itself, so a removed, in-conflict or rejected record never reaches a chart.
 */
import { DONATION_TYPE_LABELS, type Donation } from '../data/models/donation';
import type { Event } from '../data/models/event';
import { SERIES_TOKENS, type ChartSeries } from '../shared/components/dashboard/chart.models';
import { isWithinRange, type DateRange, type PeriodBucket } from './dashboard-period.util';
import { DONATION_TYPES } from './donation-breakdown.util';
import { countedDonations, totalMinor, type CountableDonation } from './donation.util';

type TimedDonation = CountableDonation & Pick<Donation, 'recordedAt'>;

/** An event or recorder and what it raised, for a ranked bar chart. */
export interface RankedTotal {
  id: string;
  label: string;
  totalMinor: number;
  /** Counted donations, in-kind included — they carry no amount but are still recordings. */
  count: number;
}

/** Donation types are compared by money raised, or by how many gifts (in-kind has no amount). */
export type TypeMeasure = 'amount' | 'count';

export const UNKNOWN_RECORDER = 'Unknown recorder';

/** Rows recorded within the range — a time filter only; aggregates apply the counting rule. */
export function donationsInRange<T extends Pick<Donation, 'recordedAt'>>(
  donations: readonly T[],
  range: DateRange,
): T[] {
  return donations.filter((donation) => isWithinRange(donation.recordedAt, range));
}

/** Minor units raised in each bucket, in bucket order. */
export function raisedSeries(
  donations: readonly TimedDonation[],
  buckets: readonly PeriodBucket[],
): number[] {
  return buckets.map((bucket) => totalMinor(donationsInRange(donations, bucket)));
}

/** One gift is one donor — the same count every report's "Donors" figure uses. */
export function donorCount(donations: readonly CountableDonation[]): number {
  return countedDonations(donations).length;
}

/** The `n` events that raised most, largest first; events with nothing counted are left out. */
export function topEventsByRaised(
  donations: readonly Donation[],
  events: readonly Pick<Event, 'id' | 'name'>[],
  n: number,
): RankedTotal[] {
  const counted = countedDonations(donations);
  const totals = events.map((event) =>
    rankedTotal(
      event.id,
      event.name,
      counted.filter((d) => d.eventId === event.id),
    ),
  );
  return topRanked(totals, n);
}

/**
 * The `n` recorders who raised most. Grouped by user id, so two recorders whose names can't be
 * resolved stay separate bars, each labelled "Unknown recorder".
 */
export function raisedByRecorder(
  donations: readonly Donation[],
  nameOf: (userId: string) => string | undefined,
  n: number,
): RankedTotal[] {
  const counted = countedDonations(donations);
  const recorderIds = [...new Set(counted.map((d) => d.recordedBy))];
  const totals = recorderIds.map((id) =>
    rankedTotal(
      id,
      nameOf(id) ?? UNKNOWN_RECORDER,
      counted.filter((d) => d.recordedBy === id),
    ),
  );
  return topRanked(totals, n);
}

/** Minor units raised in each Accra hour of the day, 0–23 (Accra is UTC+0). */
export function raisedByHour(donations: readonly TimedDonation[]): number[] {
  const counted = countedDonations(donations);
  return Array.from({ length: 24 }, (_, hour) =>
    totalMinor(counted.filter((d) => new Date(d.recordedAt).getUTCHours() === hour)),
  );
}

/** The busiest hour by money raised, or null when nothing has an amount yet. */
export function peakHour(donations: readonly TimedDonation[]): number | null {
  const byHour = raisedByHour(donations);
  const peak = Math.max(...byHour);
  return peak > 0 ? byHour.indexOf(peak) : null;
}

/** One doughnut arc per donation type, in the fixed cash / mobile money / in-kind slot order. */
export function typeSeries(
  donations: readonly Donation[],
  measure: TypeMeasure = 'amount',
): ChartSeries[] {
  const counted = countedDonations(donations);
  return DONATION_TYPES.map((type, slot) => {
    const ofType = counted.filter((d) => d.donationType === type);
    return {
      key: type,
      label: DONATION_TYPE_LABELS[type],
      values: [measure === 'amount' ? totalMinor(ofType) : ofType.length],
      colorToken: SERIES_TOKENS[slot],
    };
  });
}

function rankedTotal(id: string, label: string, rows: readonly Donation[]): RankedTotal {
  return { id, label, totalMinor: totalMinor(rows), count: rows.length };
}

// Ties sort by name, so equal totals keep a stable, predictable order between refreshes.
function topRanked(totals: readonly RankedTotal[], n: number): RankedTotal[] {
  return totals
    .filter((total) => total.count > 0)
    .sort((a, b) => b.totalMinor - a.totalMinor || a.label.localeCompare(b.label))
    .slice(0, n);
}
