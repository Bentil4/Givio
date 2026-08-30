/**
 * Donation domain model. Field names follow the DMS documents in /docs.
 * Money is held in MINOR UNITS (pesewas) as an integer — never a float. A GH₵ 500.00
 * gift is 50000. Floats accumulate error the moment you total 142 of them, and this
 * number is read back to grieving families.
 */
export type DonationType = 'cash' | 'mobile_money' | 'in_kind';

export type SyncStatus = 'synced' | 'pending' | 'retrying' | 'conflict' | 'failed';

export interface Donation {
  readonly id: string;
  readonly eventId: string;
  readonly receiptNumber: string;
  donorName: string;
  /** Minor units (pesewas). Null only when donationType is 'in_kind'. */
  amountMinor: number | null;
  donationType: DonationType;
  onBehalfOf?: string;
  /** Admin + recording operator only. MUST NOT appear in any family-scoped payload. */
  donorPhone?: string;
  notes?: string;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly deskLabel?: string;
  syncStatus: SyncStatus;
  /** Soft delete. Excluded from every total and export while set. */
  deletedAt?: string | null;
  deletedBy?: string;
  deletionReason?: string;
}

/** What the entry form emits. No id or receipt number yet — the queue or server assigns those. */
export interface DonationDraft {
  localId: string;
  eventId: string;
  donorName: string;
  amountMinor: number | null;
  donationType: DonationType;
  onBehalfOf?: string;
  donorPhone?: string;
  notes?: string;
  queuedAt?: string;
  attempts?: number;
}

/** Two versions of one record after an offline desk syncs. Neither is discarded automatically. */
export interface ConflictPair {
  readonly receiptNumber: string;
  readonly local: Donation;
  readonly server: Donation;
  readonly detectedAt: string;
}

export type ConflictResolution = 'keep-local' | 'keep-server' | 'keep-both';

export const DONATION_TYPE_LABELS: Record<DonationType, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  in_kind: 'In-Kind',
};

/** GH₵ 68,450 — grouped, no decimals. For headline totals. */
export function formatCedisShort(amountMinor: number): string {
  return 'GH\u20B5 ' + Math.round(amountMinor / 100).toLocaleString('en-GH');
}

/** GH₵ 500.00 — always 2dp. For receipts, rows and confirmations. */
export function formatCedis(amountMinor: number | null): string {
  if (amountMinor === null) return '\u2014';
  return 'GH\u20B5 ' + (amountMinor / 100).toLocaleString('en-GH', {
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
