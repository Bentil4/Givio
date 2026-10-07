import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../../core/appwrite/client';
import { FunctionRejectedError, invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { ServiceError } from '../../core/services/service-error';

// Keep in sync with functions/set-role-and-permissions/src/support-requests.js.
export const SUPPORT_MESSAGE_MAX = 2000;
export const SUPPORT_TENANT_NAME_MAX = 128;
export const SUPPORT_EMAIL_MAX = 254;
// Linear-time (domain labels exclude '.') — the same pattern the Function validates with.
export const SUPPORT_EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export interface DisputeSubmission {
  email: string;
  tenantName: string;
  message: string;
}

const UNREACHABLE = "Couldn't send your message. Check your connection and try again.";

/**
 * SupportRequests rows are written only by the Function and readable only by Admin — this
 * service never reads them back (FR-20: a logged form, no ticket-status tracking), only
 * counts the open ones for the Admin dashboard.
 */
@Injectable({ providedIn: 'root' })
export class SupportRequestDataService {
  private readonly functions = inject(FUNCTIONS);

  /** The Function derives tenant and user from the caller's own Membership. */
  async submitQuestion(message: string): Promise<void> {
    await this.invoke('submitSupportRequest', { message });
  }

  /** Unauthenticated: a suspended tenant's Organizer can't sign in to use submitQuestion. */
  async submitDispute(dispute: DisputeSubmission): Promise<void> {
    await this.invoke('submitDispute', dispute);
  }

  /** Admin-only, through the Function: the client holds no support table ID to count with. */
  async countOpenRequests(): Promise<number> {
    const { counts } = await invokeAdminFunction<{ counts: { supportRequests: number } }>(
      this.functions,
      {
        action: 'countOpenSupportRequests',
        invokeFailureMessage: 'Failed to count open support requests',
        payload: {},
      },
    );
    return counts.supportRequests;
  }

  private async invoke(action: string, payload: object): Promise<void> {
    try {
      await invokeAdminFunction(this.functions, {
        action,
        invokeFailureMessage: UNREACHABLE,
        payload,
      });
    } catch (error) {
      // A 4xx carries a message written for the person (validation, rate limit); a 5xx's text
      // is operator-facing ("Server misconfiguration…") and must not reach the form.
      if (error instanceof FunctionRejectedError && error.status < 500) throw error;
      throw new ServiceError(UNREACHABLE, error);
    }
  }
}
