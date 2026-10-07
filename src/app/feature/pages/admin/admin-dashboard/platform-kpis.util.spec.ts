import type { Tenant, TenantStatus } from '../../../../data/models/tenant';
import {
  activeCompaniesKpi,
  approvalTurnaroundKpi,
  newSignupsKpi,
  openSupportKpi,
  pendingApprovalsKpi,
  type PeriodWindow,
} from './platform-kpis.util';

const WINDOW: PeriodWindow = {
  current: { start: '2026-10-05T00:00:00.000Z', end: '2026-10-12T00:00:00.000Z' },
  previous: { start: '2026-09-28T00:00:00.000Z', end: '2026-10-05T00:00:00.000Z' },
  comparisonLabel: 'vs previous 7 days',
};

function signup(createdAt: string, status: TenantStatus, verifiedAt?: string): Tenant {
  return { createdAt, status, verifiedAt, verificationDocumentId: 'doc' } as Tenant;
}

const TENANTS = [
  // this week: two approved (1 and 5 business days), one pending
  signup('2026-10-05T00:00:00Z', 'approved', '2026-10-06T00:00:00Z'),
  signup('2026-10-05T00:00:00Z', 'suspended', '2026-10-12T00:00:00Z'),
  signup('2026-10-07T00:00:00Z', 'pending'),
  // last week: one approved, quickly
  signup('2026-09-28T00:00:00Z', 'approved', '2026-09-28T12:00:00Z'),
];

describe('platform KPI views', () => {
  it('counts active companies and compares new approvals with the period before', () => {
    const view = activeCompaniesKpi(TENANTS, WINDOW);

    expect(view.value).toBe('2');
    expect(view.hint).toBe('1 approved this period · 1 suspended');
    expect(view.delta).toEqual({
      direction: 'flat',
      percent: 0,
      comparisonLabel: 'in approvals vs previous 7 days',
    });
  });

  it('counts signups in the period with their change', () => {
    const view = newSignupsKpi(TENANTS, WINDOW);

    expect(view.value).toBe('3');
    expect(view.delta).toEqual({
      direction: 'up',
      percent: 200,
      comparisonLabel: 'vs previous 7 days',
    });
  });

  it('shows no change for All time, which has no previous period', () => {
    expect(newSignupsKpi(TENANTS, { ...WINDOW, comparisonLabel: null }).delta).toBeNull();
  });

  it('reports the median turnaround in days against the 3-business-day target', () => {
    const view = approvalTurnaroundKpi(TENANTS, WINDOW);

    expect(view.value).toBe('1.0 days');
    expect(view.status).toBe('on-target');
    expect(view.delta?.direction).toBe('up');
  });

  it('flags a turnaround over the target', () => {
    const slow = [signup('2026-10-05T00:00:00Z', 'approved', '2026-10-09T12:00:00Z')];

    const view = approvalTurnaroundKpi(slow, WINDOW);

    expect(view.value).toBe('4.5 days');
    expect(view.status).toBe('over-target');
  });

  it('shows a gap, not zero, when nothing was approved in the period', () => {
    const view = approvalTurnaroundKpi([], WINDOW);

    expect(view.value).toBe('—');
    expect(view.status).toBeNull();
  });

  it('splits pending approvals by queue, and shows a gap until they are counted', () => {
    const counts = { applications: 2, identityReviews: 1, duplicateEvents: 0 };

    expect(pendingApprovalsKpi(counts, 'ready')).toMatchObject({
      value: '3',
      hint: '2 applications · 1 flagged addition · 0 duplicate events',
    });
    expect(pendingApprovalsKpi(counts, 'unavailable').value).toBe('—');
  });

  it('shows open support requests as unavailable, never zero, when unread', () => {
    expect(openSupportKpi(7).value).toBe('7');
    expect(openSupportKpi(null)).toMatchObject({ value: '—', hint: 'Not available' });
  });
});
