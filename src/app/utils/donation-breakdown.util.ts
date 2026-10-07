import type { Donation, DonationType } from '../data/models/donation';
import { formatCedis, formatCedisShort, totalMinor } from './donation.util';

export interface GiftAverages {
  averageMinor: number | null;
  medianMinor: number | null;
}

export interface DonationStat {
  key: string;
  value: string;
  sub: string;
}

/** The fixed order donation types are listed and coloured in, everywhere. */
export const DONATION_TYPES: readonly DonationType[] = ['cash', 'mobile_money', 'in_kind'];

/** Total raised, donors, average and largest gift — the headline figures of a report. */
export function donationStats(rows: readonly Donation[], periodLabel: string): DonationStat[] {
  const total = totalMinor(rows);
  const amounts = sortedAmounts(rows);
  return [
    {
      key: 'Total raised',
      value: formatCedisShort(total),
      sub: `${rows.length} validated records`,
    },
    { key: 'Donors', value: String(rows.length), sub: periodLabel || 'this event' },
    averageStat(rows),
    largestStat(rows, amounts),
  ];
}

/** Mean and median of the gifts that carry an amount; null when none do (in-kind only). */
export function giftAverages(rows: readonly Donation[]): GiftAverages {
  const amounts = sortedAmounts(rows);
  if (amounts.length === 0) return { averageMinor: null, medianMinor: null };
  return {
    averageMinor: Math.round(totalMinor(rows) / amounts.length),
    medianMinor: medianOf(amounts),
  };
}

function averageStat(rows: readonly Donation[]): DonationStat {
  const { averageMinor, medianMinor } = giftAverages(rows);
  return {
    key: 'Average gift',
    value: averageMinor === null ? '—' : formatCedisShort(averageMinor),
    sub: medianMinor ? `Median ${formatCedis(medianMinor)}` : 'no cash gifts yet',
  };
}

function largestStat(rows: readonly Donation[], amounts: readonly number[]): DonationStat {
  const largest = amounts.length ? amounts[amounts.length - 1] : 0;
  const donor = rows.find((d) => d.amountMinor === largest);
  return {
    key: 'Largest gift',
    value: largest ? formatCedisShort(largest) : '—',
    sub: donor?.onBehalfOf || donor?.donorName || '—',
  };
}

function sortedAmounts(rows: readonly Donation[]): number[] {
  return rows
    .map((d) => d.amountMinor)
    .filter((amount): amount is number => amount !== null)
    .sort((a, b) => a - b);
}

function medianOf(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
