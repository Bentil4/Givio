import type { Donation } from '../data/models/donation';

/** GH₵ 68,450 — grouped, no decimals. For headline totals. */
export function formatCedisShort(amountMinor: number): string {
  return 'GH₵ ' + Math.round(amountMinor / 100).toLocaleString('en-GH');
}

/** GH₵ 500.00 — always 2dp. For receipts, rows and confirmations. */
export function formatCedis(amountMinor: number | null): string {
  if (amountMinor === null) return 'GH₵ 0.00';
  return (
    'GH₵ ' +
    (amountMinor / 100).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** The only fields the shared counting rule reads — lets aggregate-only reads skip full rows. */
export type CountableDonation = Pick<Donation, 'amountMinor' | 'deletedAt' | 'syncStatus'>;

/** Totals must never include soft-deleted, in-conflict or server-rejected records. */
export function totalMinor(donations: readonly CountableDonation[]): number {
  return countedDonations(donations).reduce((sum, d) => sum + (d.amountMinor ?? 0), 0);
}

/** The donations a total counts — the single home of the exclusion rule above. */
export function countedDonations<T extends CountableDonation>(donations: readonly T[]): T[] {
  return donations.filter(
    (d) => !d.deletedAt && d.syncStatus !== 'conflict' && d.syncStatus !== 'failed',
  );
}
