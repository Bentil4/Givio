import type { AdminUser } from '../../../../data/models/admin-user';
import type { Tenant, TenantStatus } from '../../../../data/models/tenant';

/** The order the dashboard lists company statuses in — live companies first. */
export const COMPANY_STATUSES: readonly TenantStatus[] = [
  'approved',
  'pending',
  'suspended',
  'rejected',
];

export const COMPANY_STATUS_LABELS: Record<TenantStatus, string> = {
  approved: 'Active',
  pending: 'Awaiting approval',
  suspended: 'Suspended',
  rejected: 'Rejected',
};

export interface UserCounts {
  readonly total: number;
  readonly admins: number;
  readonly operators: number;
  /** Organizer-tier company accounts carry no role Label (Story 6.2). */
  readonly companyAccounts: number;
}

export function countCompaniesByStatus(tenants: readonly Tenant[]): Record<TenantStatus, number> {
  const counts = { approved: 0, pending: 0, suspended: 0, rejected: 0 };
  for (const tenant of tenants) {
    counts[tenant.status] += 1;
  }
  return counts;
}

export function countUsersByRole(users: readonly AdminUser[]): UserCounts {
  return {
    total: users.length,
    admins: users.filter((user) => user.role === 'admin').length,
    operators: users.filter((user) => user.role === 'operator').length,
    companyAccounts: users.filter((user) => user.role === null).length,
  };
}
