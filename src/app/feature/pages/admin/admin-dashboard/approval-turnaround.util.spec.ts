import type { Tenant, TenantStatus } from '../../../../data/models/tenant';
import {
  businessDaysBetween,
  medianApprovalTurnaround,
  turnaroundStatus,
} from './approval-turnaround.util';

const OCTOBER = { start: '2026-10-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z' };

function signup(createdAt: string, verifiedAt: string, status: TenantStatus = 'approved'): Tenant {
  return { createdAt, verifiedAt, status, verificationDocumentId: 'doc' } as Tenant;
}

describe('businessDaysBetween', () => {
  it('counts whole and part weekdays', () => {
    // Monday 5 Oct 12:00 to Tuesday 6 Oct 18:00
    expect(businessDaysBetween('2026-10-05T12:00:00Z', '2026-10-06T18:00:00Z')).toBe(1.25);
  });

  it('skips Saturday and Sunday', () => {
    // Friday 9 Oct 12:00 to Monday 12 Oct 12:00 — half of Friday plus half of Monday
    expect(businessDaysBetween('2026-10-09T12:00:00Z', '2026-10-12T12:00:00Z')).toBe(1);
  });

  it('is zero for time spent entirely over a weekend', () => {
    expect(businessDaysBetween('2026-10-10T09:00:00Z', '2026-10-11T17:00:00Z')).toBe(0);
  });

  it('counts a full working week as five days', () => {
    expect(businessDaysBetween('2026-10-05T00:00:00Z', '2026-10-12T00:00:00Z')).toBe(5);
  });
});

describe('medianApprovalTurnaround', () => {
  it('takes the median of the signups approved in the range', () => {
    const tenants = [
      signup('2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z'),
      signup('2026-10-05T00:00:00Z', '2026-10-07T00:00:00Z', 'suspended'),
      signup('2026-10-05T00:00:00Z', '2026-10-09T00:00:00Z'),
      signup('2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z'),
    ];

    expect(medianApprovalTurnaround(tenants, OCTOBER)).toBe(2);
  });

  it('averages the middle two of an even count', () => {
    const tenants = [
      signup('2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z'),
      signup('2026-10-05T00:00:00Z', '2026-10-07T00:00:00Z'),
    ];

    expect(medianApprovalTurnaround(tenants, OCTOBER)).toBe(1.5);
  });

  it('leaves out pending, rejected and Admin-invited companies', () => {
    const invited = { ...signup('2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z') };
    delete invited.verificationDocumentId;
    const tenants = [
      invited,
      signup('2026-10-05T00:00:00Z', '2026-10-09T00:00:00Z', 'rejected'),
      { createdAt: '2026-10-05T00:00:00Z', status: 'pending' } as Tenant,
    ];

    expect(medianApprovalTurnaround(tenants, OCTOBER)).toBeNull();
  });
});

describe('turnaroundStatus', () => {
  it('is on target up to and including three business days', () => {
    expect(turnaroundStatus(3)).toBe('on-target');
    expect(turnaroundStatus(3.1)).toBe('over-target');
  });
});
