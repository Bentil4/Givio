import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import type { Donation } from '../models/donation';
import type { FamilyEventSummary } from '../models/family-access';

interface SanitizedDonation {
  id: string;
  donorName: string;
  amountMinor: number | null;
  donationType: Donation['donationType'];
  onBehalfOf?: string;
  recordedAt: string;
}

interface ResolveAccessCodeResult {
  event: FamilyEventSummary;
  donations: SanitizedDonation[];
}

export interface FamilyAccessResult {
  event: FamilyEventSummary;
  donations: Donation[];
}

/**
 * A sanitized donation carries no eventId/receiptNumber/recordedBy (resolveAccessCode's
 * Function action deliberately never sends them to Family) — filled with harmless
 * placeholders here so the shared DonationRow component (which types its input as a full
 * Donation) can render it. Family never edits or re-submits these, so the placeholders are
 * never round-tripped anywhere that matters.
 */
function toDonation(d: SanitizedDonation): Donation {
  return {
    id: d.id,
    eventId: '',
    receiptNumber: d.id,
    donorName: d.donorName,
    amountMinor: d.amountMinor,
    donationType: d.donationType,
    onBehalfOf: d.onBehalfOf,
    recordedBy: '',
    recordedAt: d.recordedAt,
    syncStatus: 'synced',
  };
}

@Injectable({ providedIn: 'root' })
export class FamilyAccessDataService {
  private readonly functions = inject(FUNCTIONS);

  /**
   * Fully unauthenticated — a Family Member has no account (AD-10). The Function's own
   * execute permission was opened to `any` for exactly this action; every other action on
   * this Function still requires a signed-in user, enforced both by Appwrite and by the
   * Function's own per-action checks.
   *
   * Throws ServiceError('Code not recognised') on any miss — never reveals which half of
   * the code was wrong (family-code.ts's own design intent).
   */
  async resolveByCode(code: string): Promise<FamilyAccessResult> {
    const result = await invokeAdminFunction<ResolveAccessCodeResult>(
      this.functions,
      'resolveAccessCode',
      'Code not recognised',
      { code },
    );
    return {
      event: result.event,
      donations: result.donations.map(toDonation),
    };
  }
}
