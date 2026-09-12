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
  /**
   * NOT readonly (AD-8): starts as a client-assigned provisional number
   * (`{eventShortCode}-P{n}`) and is overwritten with the canonical sequential number the
   * Function assigns via the Event's atomic `nextReceiptSeq` counter the moment the donation
   * actually reaches Appwrite — whether that's inline at creation or a later synced retry.
   * Nothing already printed needs reprinting; only this stored value changes.
   */
  receiptNumber: string;
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
  /** Set only once the donation has been edited — absence means "never edited". */
  updatedAt?: string;
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
