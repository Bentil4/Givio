import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../../core/appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { ServiceError } from '../../core/services/service-error';
import type { Donation } from '../models/donation';
import { FAMILY_CODE_LENGTH, type FamilyEventSummary } from '../models/family-access';

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

/**
 * The Function answered and said no — the code is wrong or was regenerated. Distinct from a
 * network failure (whose ServiceError cause is the thrown transport error, not a response
 * body), so an open family view can tell "revoked" apart from "offline for a moment".
 */
export class FamilyCodeRejectedError extends ServiceError {
  constructor(cause: unknown) {
    super('Code not recognised', cause);
    this.name = 'FamilyCodeRejectedError';
  }
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
   * Throws FamilyCodeRejectedError on any miss — never reveals which half of the code was
   * wrong (family-code.ts's own design intent). Any other failure (offline, a 5xx) is a plain
   * ServiceError, so callers can retry it instead of telling the family their code is wrong.
   */
  async resolveByCode(code: string): Promise<FamilyAccessResult> {
    // The Function's only 400 for this action is a wrong-length code; answering it here keeps
    // that a rejection rather than letting it read as a server fault that's worth retrying.
    if (code.length !== FAMILY_CODE_LENGTH) throw new FamilyCodeRejectedError(undefined);

    let result: ResolveAccessCodeResult;
    try {
      result = await invokeAdminFunction<ResolveAccessCodeResult>(this.functions, {
        action: 'resolveAccessCode',
        invokeFailureMessage: 'Could not reach the server, try again',
        payload: { code },
      });
    } catch (error) {
      if (error instanceof ServiceError && isCodeRejection(error)) {
        throw new FamilyCodeRejectedError(error.cause);
      }
      throw error;
    }
    return {
      event: result.event,
      donations: result.donations.map(toDonation),
    };
  }
}

/** invokeAdminFunction puts the raw response body in `cause` only when the Function responded. */
function isCodeRejection(error: ServiceError): boolean {
  if (typeof error.cause !== 'string') return false;
  try {
    return (JSON.parse(error.cause) as { error?: unknown }).error === 'Code not recognised';
  } catch {
    return false;
  }
}
