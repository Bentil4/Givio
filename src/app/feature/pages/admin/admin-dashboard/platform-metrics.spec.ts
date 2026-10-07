import type { AdminUser } from '../../../../data/models/admin-user';
import type { Tenant } from '../../../../data/models/tenant';
import { countCompaniesByStatus, countUsersByRole } from './platform-metrics';

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
});
