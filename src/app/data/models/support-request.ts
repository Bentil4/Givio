export type SupportRequestType = 'question' | 'dispute';
export type SupportRequestStatus = 'open' | 'closed';

/** One row of the Admin support inbox, as the Function's `listSupportRequests` returns it. */
export interface SupportRequest {
  readonly id: string;
  readonly type: SupportRequestType;
  readonly status: SupportRequestStatus;
  readonly message: string;
  /** ISO timestamp. */
  readonly createdAt: string;
  readonly tenantId: string | null;
  readonly tenantName: string | null;
  readonly contactEmail: string | null;
  readonly senderName: string | null;
  readonly senderEmail: string | null;
}

export interface SupportRequestPage {
  readonly requests: readonly SupportRequest[];
  /** null on the last page. */
  readonly nextCursor: string | null;
}

export interface SupportRequestListOptions {
  readonly status: SupportRequestStatus;
  readonly cursor?: string | null;
}
