import type { AdminUser } from '../../../../data/models/admin-user';
import type { Tenant, TenantStatus } from '../../../../data/models/tenant';
import { bucketsFor, type DateRange } from '../../../../utils/dashboard-period.util';
import {
  companyStatusCounts,
  companyTypeCounts,
  countApprovalsIn,
  countCompaniesByStatus,
  countSignupsIn,
  countUsersByRole,
  formatCountTick,
  signupsAndApprovalsPerBucket,
  userRoleCounts,
} from './platform-metrics';

const WEEK: DateRange = { start: '2026-10-01T00:00:00.000Z', end: '2026-10-07T12:00:00.000Z' };

function company(createdAt: string, status: TenantStatus, verifiedAt?: string): Tenant {
  return { createdAt, status, verifiedAt, type: 'funeral' } as Tenant;
}

const TENANTS = [
  company('2026-10-01T09:00:00Z', 'approved', '2026-10-03T09:00:00Z'),
  company('2026-10-03T09:00:00Z', 'suspended', '2026-10-03T15:00:00Z'),
  company('2026-10-03T10:00:00Z', 'pending'),
  company('2026-10-04T10:00:00Z', 'rejected', '2026-10-05T10:00:00Z'),
  company('2026-09-20T10:00:00Z', 'approved', '2026-09-22T10:00:00Z'),
];

describe('platform metrics', () => {
  it('counts companies in every status, including the ones with none', () => {
    const tenants = [{ status: 'approved' }, { status: 'approved' }, { status: 'rejected' }];

    expect(countCompaniesByStatus(tenants as Tenant[])).toEqual({
      approved: 2,
      pending: 0,
      suspended: 0,
      rejected: 1,
    });
  });

  it('counts users by role, unlabelled company accounts separately', () => {
    const users = [{ role: 'admin' }, { role: 'operator' }, { role: null }, { role: null }];

    expect(countUsersByRole(users as AdminUser[])).toEqual({
      total: 4,
      admins: 1,
      operators: 1,
      companyAccounts: 2,
    });
  });

  it('counts signups by creation date and approvals by approval date', () => {
    expect(countSignupsIn(TENANTS, WEEK)).toBe(4);
    // a rejected company was verified but never approved
    expect(countApprovalsIn(TENANTS, WEEK)).toBe(2);
  });

  it('buckets signups and approvals per day of the range', () => {
    const buckets = bucketsFor(WEEK, '7d');

    const { signups, approvals } = signupsAndApprovalsPerBucket(TENANTS, buckets);

    expect(buckets).toHaveLength(7);
    expect(signups).toEqual([1, 0, 2, 1, 0, 0, 0]);
    expect(approvals).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });

  it('labels every status and type, unknown types counted as Other', () => {
    const tenants = [...TENANTS, { type: 'concert', status: 'approved' } as Tenant];

    expect(companyStatusCounts(tenants).map((c) => `${c.label} ${c.count}`)).toEqual([
      'Active 3',
      'Awaiting approval 1',
      'Suspended 1',
      'Rejected 1',
    ]);
    expect(companyTypeCounts(tenants).map((c) => c.count)).toEqual([5, 0, 0, 1]);
  });

  it('names the three account kinds for the role chart', () => {
    const users = [{ role: 'admin' }, { role: null }] as AdminUser[];

    expect(userRoleCounts(users).map((c) => `${c.label} ${c.count}`)).toEqual([
      'Admins 1',
      'Operators 0',
      'Company accounts 1',
    ]);
  });

  it('leaves fractional count ticks blank', () => {
    expect(formatCountTick(2)).toBe('2');
    expect(formatCountTick(0.5)).toBe('');
  });
});
