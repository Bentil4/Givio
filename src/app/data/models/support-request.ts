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
  /** ISO timestamp, set only while the request is closed. */
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  /** The closing Admin's name, or email when they have no name. */
  readonly closedByName: string | null;
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
