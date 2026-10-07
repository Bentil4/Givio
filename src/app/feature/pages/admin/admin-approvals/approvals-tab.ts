/** The Approvals screen's queues, in tab order; also its `?tab=` query values. */
export const APPROVALS_TABS = ['applications', 'flagged', 'duplicates'] as const;

export type ApprovalsTab = (typeof APPROVALS_TABS)[number];
