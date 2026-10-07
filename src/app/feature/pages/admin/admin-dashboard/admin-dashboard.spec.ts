import { TestBed } from '@angular/core/testing';
import { signal, type Type } from '@angular/core';
import { provideRouter } from '@angular/router';
import { createFakeCharts, type FakeCharts } from '../../../../../testing/fake-chart';
import type { AdminUser } from '../../../../data/models/admin-user';
import type { ApprovalCountsState } from '../../../../data/models/approval-counts';
import type { Tenant, TenantStatus } from '../../../../data/models/tenant';
import { ApprovalCountsService } from '../../../../data/services/approval-counts.service';
import { AuditLogDataService } from '../../../../data/services/audit-log-data.service';
import { AuthService } from '../../../../data/services/auth.service';
import { CompanyConflictDataService } from '../../../../data/services/company-conflict-data.service';
import { CompanyDonationDataService } from '../../../../data/services/company-donation-data.service';
import { DonationDataService } from '../../../../data/services/donation-data.service';
import { DonationService } from '../../../../data/services/donation.service';
import { EventDataService } from '../../../../data/services/event-data.service';
import { EventService } from '../../../../data/services/event.service';
import { OrganizerEventDataService } from '../../../../data/services/organizer-event-data.service';
import { SettlementDataService } from '../../../../data/services/settlement-data.service';
import { SupportRequestDataService } from '../../../../data/services/support-request-data.service';
import { TenantLifecycleDataService } from '../../../../data/services/tenant-lifecycle-data.service';
import { TenantTotalsDataService } from '../../../../data/services/tenant-totals-data.service';
import { UserService } from '../../../../data/services/user.service';
import { CompanyTotalsStore } from '../../company/company-dashboard/company-totals.store';
import { AdminDashboard } from './admin-dashboard';

/** Company event, donation and totals data — off limits to platform Admins (AD-12). */
const COMPANY_DATA_SERVICES: readonly Type<unknown>[] = [
  EventService,
  EventDataService,
  OrganizerEventDataService,
  DonationService,
  DonationDataService,
  CompanyDonationDataService,
  CompanyConflictDataService,
  SettlementDataService,
  TenantTotalsDataService,
  CompanyTotalsStore,
];

const NOW = new Date('2026-10-07T12:00:00.000Z');
const STORAGE_KEY = 'givio.admin-dashboard.period.admin-1';

function tenant(id: string, status: TenantStatus, createdAt: string, verifiedAt?: string): Tenant {
  return { id, name: id, status, createdAt, verifiedAt, type: 'funeral' } as Tenant;
}

const TENANTS = [
  tenant('t1', 'approved', '2026-09-20T09:00:00Z', '2026-09-25T09:00:00Z'),
  tenant('t2', 'approved', '2026-06-01T09:00:00Z', '2026-06-02T09:00:00Z'),
  tenant('t3', 'pending', '2026-10-06T09:00:00Z'),
  tenant('t4', 'suspended', '2026-05-01T09:00:00Z', '2026-05-02T09:00:00Z'),
];
const USERS = [
  { id: 'admin-1', role: 'admin', name: 'Ama', email: 'ama@example.com' },
  { id: 'o1', role: 'operator' },
  { id: 'c1', role: null },
] as AdminUser[];

describe('AdminDashboard (platform data only — AD-12, amended 2026-10-07)', () => {
  let charts: FakeCharts;
  let listTenants: ReturnType<typeof vi.fn>;
  let countOpenRequests: ReturnType<typeof vi.fn>;
  let touchedCompanyData: string[];
  const approvalsState = signal<ApprovalCountsState>('ready');

  function tripwire(service: Type<unknown>) {
    return {
      provide: service,
      useFactory: () => {
        touchedCompanyData.push(service.name);
        return {};
      },
    };
  }

  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [AdminDashboard],
      providers: [
        provideRouter([]),
        charts.provider,
        { provide: AuthService, useValue: { currentUser: signal({ $id: 'admin-1' }) } },
        { provide: TenantLifecycleDataService, useValue: { listTenants } },
        { provide: UserService, useValue: { listUsers: async () => USERS } },
        { provide: SupportRequestDataService, useValue: { countOpenRequests } },
        { provide: AuditLogDataService, useValue: { listRecentAuditLogs: async () => [] } },
        {
          provide: ApprovalCountsService,
          useValue: {
            counts: signal({ applications: 2, identityReviews: 1, duplicateEvents: 0 }),
            state: approvalsState,
          },
        },
        ...COMPANY_DATA_SERVICES.map(tripwire),
      ],
    });
    const fixture = TestBed.createComponent(AdminDashboard);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
    });
    return fixture.nativeElement as HTMLElement;
  }

  const tile = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll('app-kpi-tile')]
      .find((t) => t.querySelector('.stat-label')?.textContent?.includes(label))
      ?.textContent?.replace(/\s+/g, ' ') ?? '';

  const titles = (el: HTMLElement) =>
    [...el.querySelectorAll('h2')].map((h) => h.textContent?.trim());

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    charts = createFakeCharts();
    touchedCompanyData = [];
    listTenants = vi.fn().mockResolvedValue(TENANTS);
    countOpenRequests = vi.fn().mockResolvedValue(7);
    approvalsState.set('ready');
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('shows the platform figures for the default 30 days', async () => {
    const el = await render();

    expect(el.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain(
      '30 days',
    );
    expect(tile(el, 'Active companies')).toContain('2');
    expect(tile(el, 'Active companies')).toContain('1 approved this period · 1 suspended');
    expect(tile(el, 'New signups')).toContain('2');
    expect(tile(el, 'Pending approvals')).toContain('3');
    expect(tile(el, 'Open support requests')).toContain('7');
  });

  it('draws the four platform charts and both panels', async () => {
    const el = await render();

    expect(titles(el)).toEqual([
      'Signups and approvals',
      'Companies by status',
      'Users by role',
      'Companies by type',
      'Approval queues',
      'Recent platform activity',
    ]);
    expect(charts.created.map((c) => c.createdWith.type)).toContain('doughnut');
  });

  it('never injects or calls a company event, donation or totals service', async () => {
    const el = await render();

    expect(touchedCompanyData).toEqual([]);
    const text = el.textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('raised');
    expect(text).not.toContain('gh₵');
    const links = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(links.filter((href) => /event|donation|settlement/.test(href))).toEqual([]);
  });

  it('remembers the chosen period for this Admin and recounts for it', async () => {
    const el = await render();

    const sevenDays = [...el.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) =>
      b.textContent?.includes('7 days'),
    )!;
    sevenDays.click();
    await vi.waitFor(() => expect(tile(el, 'New signups')).toMatch(/New signups\s*1/));

    expect(localStorage.getItem(STORAGE_KEY)).toBe('7d');
    expect(tile(el, 'Active companies')).toContain('0 approved this period');
  });

  it('opens on the remembered period', async () => {
    localStorage.setItem(STORAGE_KEY, 'all');

    const el = await render();

    expect(el.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain(
      'All time',
    );
    expect(tile(el, 'New signups')).toContain('4');
  });

  it('shows a retryable error on the company charts and gaps in their figures', async () => {
    listTenants.mockRejectedValueOnce(new Error('offline'));

    const el = await render();

    expect(tile(el, 'Active companies')).toContain('Not available');
    const retry = el.querySelector<HTMLButtonElement>('.chart-card-error button')!;
    expect(el.textContent).toContain("Couldn't load companies.");
    retry.click();
    await vi.waitFor(() => expect(tile(el, 'Active companies')).toContain('1 suspended'));
    expect(listTenants).toHaveBeenCalledTimes(2);
  });

  it('shows support and approval counts as unavailable, never as zero', async () => {
    countOpenRequests.mockRejectedValueOnce(new Error('offline'));
    approvalsState.set('unavailable');

    const el = await render();

    expect(tile(el, 'Open support requests')).toContain('—');
    expect(tile(el, 'Open support requests')).toContain('Not available');
    expect(tile(el, 'Pending approvals')).toContain('Not available');
  });
});
