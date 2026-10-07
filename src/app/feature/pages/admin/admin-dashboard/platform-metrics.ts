import type { AdminUser } from '../../../../data/models/admin-user';
import {
  TENANT_TYPES,
  TENANT_TYPE_LABELS,
  type Tenant,
  type TenantStatus,
  type TenantType,
} from '../../../../data/models/tenant';
import {
  bucketIndexOf,
  isWithinRange,
  type DateRange,
  type PeriodBucket,
} from '../../../../utils/dashboard-period.util';

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

/** One bar or arc of a breakdown chart. */
export interface CategoryCount {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

export interface SignupsAndApprovals {
  readonly signups: readonly number[];
  readonly approvals: readonly number[];
}

/** A company that was approved at some point; `verifiedAt` stands in for when. */
export type ApprovedTenant = Tenant & { verifiedAt: string };

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

/**
 * Approval needs the document review and phone call recorded first (verifiedAt), and there is
 * no separate approval timestamp, so verifiedAt dates it. A suspended company was approved once.
 */
export function isApprovedCompany(tenant: Tenant): tenant is ApprovedTenant {
  const wasApproved = tenant.status === 'approved' || tenant.status === 'suspended';
  return wasApproved && Boolean(tenant.verifiedAt);
}

export function countSignupsIn(tenants: readonly Tenant[], range: DateRange): number {
  return tenants.filter((tenant) => isWithinRange(tenant.createdAt, range)).length;
}

export function countApprovalsIn(tenants: readonly Tenant[], range: DateRange): number {
  return approvalTimes(tenants).filter((time) => isWithinRange(time, range)).length;
}

/** New companies and approvals per chart bucket, for the signups vs approvals chart. */
export function signupsAndApprovalsPerBucket(
  tenants: readonly Tenant[],
  buckets: readonly PeriodBucket[],
): SignupsAndApprovals {
  return {
    signups: countPerBucket(
      tenants.map((tenant) => tenant.createdAt),
      buckets,
    ),
    approvals: countPerBucket(approvalTimes(tenants), buckets),
  };
}

export function companyStatusCounts(tenants: readonly Tenant[]): CategoryCount[] {
  const counts = countCompaniesByStatus(tenants);
  return COMPANY_STATUSES.map((status) => ({
    key: status,
    label: COMPANY_STATUS_LABELS[status],
    count: counts[status],
  }));
}

/** Every company type in the signup form's order; an unrecognised type counts as Other. */
export function companyTypeCounts(tenants: readonly Tenant[]): CategoryCount[] {
  const types = tenants.map((tenant) => knownTypeOf(tenant.type));
  return TENANT_TYPES.map((type) => ({
    key: type,
    label: TENANT_TYPE_LABELS[type],
    count: types.filter((known) => known === type).length,
  }));
}

export function userRoleCounts(users: readonly AdminUser[]): CategoryCount[] {
  const counts = countUsersByRole(users);
  return [
    { key: 'admins', label: 'Admins', count: counts.admins },
    { key: 'operators', label: 'Operators', count: counts.operators },
    { key: 'companyAccounts', label: 'Company accounts', count: counts.companyAccounts },
  ];
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-GH');
}

/** A count axis has no half companies, so fractional ticks are left blank. */
export function formatCountTick(value: number): string {
  return Number.isInteger(value) ? formatCount(value) : '';
}

function approvalTimes(tenants: readonly Tenant[]): string[] {
  return tenants.filter(isApprovedCompany).map((tenant) => tenant.verifiedAt);
}

function countPerBucket(timestamps: readonly string[], buckets: readonly PeriodBucket[]): number[] {
  const counts = buckets.map(() => 0);
  for (const timestamp of timestamps) {
    const index = bucketIndexOf(timestamp, buckets);
    if (index >= 0) counts[index] += 1;
  }
  return counts;
}

function knownTypeOf(type: string): TenantType {
  return TENANT_TYPES.find((known) => known === type) ?? 'other';
}
