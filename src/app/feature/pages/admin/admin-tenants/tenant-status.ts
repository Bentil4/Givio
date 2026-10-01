import type { TenantStatus } from '../../../../data/models/tenant';

export type TenantStatusFilter = TenantStatus | 'all';

/** The account actions Admin confirms on this screen (Story 8.1). */
export type TenantAction = 'suspend' | 'reinstate';

/** A suspend/reinstate the Function did not confirm — shown as FAILED, with a retry. */
export interface TenantActionFailure {
  readonly tenantId: string;
  readonly action: TenantAction;
  readonly message: string;
}

export const TENANT_STATUS_FILTERS: readonly TenantStatusFilter[] = [
  'all',
  'approved',
  'suspended',
  'pending',
  'rejected',
];

export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  suspended: 'Suspended',
  rejected: 'Rejected',
};

export const TENANT_STATUS_TAGS: Record<TenantStatus, string> = {
  pending: 'tag tag-info',
  approved: 'tag tag-success',
  suspended: 'tag tag-error',
  rejected: 'tag tag-default',
};

export function filterLabel(filter: TenantStatusFilter): string {
  return filter === 'all' ? 'All companies' : TENANT_STATUS_LABELS[filter];
}
