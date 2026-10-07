/** How many items wait in each of the Approvals screen's three queues. */
export interface PendingApprovalCounts {
  readonly applications: number;
  readonly identityReviews: number;
  readonly duplicateEvents: number;
}

/** `unavailable` only until a first count arrives — after that, the last known counts stand. */
export type ApprovalCountsState = 'loading' | 'ready' | 'unavailable';
