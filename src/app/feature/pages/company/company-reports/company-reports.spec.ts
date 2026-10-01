import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ServiceError } from '../../../../core/services/service-error';
import { ReportService } from '../../../../data/services/report.service';
import { SettlementDataService } from '../../../../data/services/settlement-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import type { SettlementReport } from '../../../../data/services/settlement-report';
import type { Tenant } from '../../../../data/models/tenant';
import type { Event as GivioEvent } from '../../../../data/models/event';
import { CompanyReports } from './company-reports';

const TENANT: Tenant = {
  id: 't1',
  name: 'Asante Events',
  location: 'Kumasi',
  size: '11-50',
  type: 'funeral',
  estimatedUserCount: 12,
  status: 'approved',
  superOrganizerId: 'so-1',
  verifiedAt: '2026-08-10T12:00:00.000Z',
  createdAt: '2026-08-01T10:00:00.000Z',
};

const EVENT = {
  id: 'e1',
  name: 'Odoi Funeral',
  date: '2026-10-03',
  status: 'active',
} as GivioEvent;

describe('CompanyReports', () => {
  let loadTenantSettlementData: ReturnType<typeof vi.fn>;
  let exportSettlementXlsx: ReturnType<typeof vi.fn>;

  function render(tenant: Tenant, now: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    TestBed.configureTestingModule({
      imports: [CompanyReports],
      providers: [
        { provide: TenantService, useValue: { tenant: signal(tenant) } },
        { provide: SettlementDataService, useValue: { loadTenantSettlementData } },
        { provide: ReportService, useValue: { exportSettlementXlsx } },
      ],
    });
    const fixture = TestBed.createComponent(CompanyReports);
    fixture.detectChanges();
    vi.useRealTimers();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function submit(fixture: ReturnType<typeof render>['fixture']) {
    const form = (fixture.nativeElement as HTMLElement).querySelector('form')!;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    loadTenantSettlementData = vi.fn().mockResolvedValue({
      events: [EVENT],
      donations: [
        {
          id: 'd1',
          eventId: 'e1',
          amountMinor: 12_345,
          recordedAt: '2026-10-05T09:00:00.000Z',
          syncStatus: 'synced',
          deletedAt: null,
        },
      ],
    });
    exportSettlementXlsx = vi.fn();
  });

  it('shows the first-period message, not an export, before a full month has ended', () => {
    const { el } = render(
      { ...TENANT, verifiedAt: '2026-09-15T08:00:00.000Z' },
      '2026-10-01T12:00:00Z',
    );

    expect(el.textContent).toContain(
      'Your first settlement export will be available after your first full period',
    );
    expect(el.textContent).toContain('Your first period is October 2026');
    expect(el.textContent).toContain('1 November 2026');
    expect(el.querySelector('form')).toBeNull();
  });

  it('offers only completed months since approval, newest first', () => {
    const { el } = render(TENANT, '2026-11-02T08:00:00Z');

    const options = [...el.querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(options).toEqual(['October 2026', 'September 2026']);
    expect(el.querySelector<HTMLSelectElement>('select')?.value).toBe('2026-10');
  });

  it('falls back to createdAt when the tenant has no verifiedAt', () => {
    const { el } = render({ ...TENANT, verifiedAt: undefined }, '2026-10-01T08:00:00Z');

    const options = [...el.querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(options).toEqual(['September 2026']);
  });

  it('exports the chosen month from a fresh read and announces the total', async () => {
    const { fixture, el } = render(TENANT, '2026-11-02T08:00:00Z');

    await submit(fixture);

    expect(loadTenantSettlementData).toHaveBeenCalledWith('t1');
    const report: SettlementReport = exportSettlementXlsx.mock.calls[0][0];
    expect(report.period.key).toBe('2026-10');
    expect(report.periodTotalMinor).toBe(12_345);
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      'Exported October 2026: GH₵ 123.45 across 1 event.',
    );
  });

  it('shows the data error and writes no file when the read fails', async () => {
    loadTenantSettlementData.mockRejectedValue(new ServiceError("We couldn't load your events"));
    const { fixture, el } = render(TENANT, '2026-11-02T08:00:00Z');

    await submit(fixture);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      "We couldn't load your events",
    );
    expect(exportSettlementXlsx).not.toHaveBeenCalled();
  });
});
