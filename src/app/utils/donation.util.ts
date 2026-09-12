import type { Donation } from '../data/models/donation';

/** GH₵ 68,450 — grouped, no decimals. For headline totals. */
export function formatCedisShort(amountMinor: number): string {
  return 'GH₵ ' + Math.round(amountMinor / 100).toLocaleString('en-GH');
}

/** GH₵ 500.00 — always 2dp. For receipts, rows and confirmations. */
export function formatCedis(amountMinor: number | null): string {
  if (amountMinor === null) return 'GH₵ 0.00';
  return 'GH₵ ' + (amountMinor / 100).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Totals must never include soft-deleted or in-conflict records. */
export function totalMinor(donations: readonly Donation[]): number {
  return donations
    .filter((d) => !d.deletedAt && d.syncStatus !== 'conflict')
    .reduce((sum, d) => sum + (d.amountMinor ?? 0), 0);
}
