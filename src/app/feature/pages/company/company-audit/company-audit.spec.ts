import { TestBed } from '@angular/core/testing';
import { CompanyAudit } from './company-audit';
import { TenantAuditDataService } from '../../../../data/services/tenant-audit-data.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import { ServiceError } from '../../../../core/services/service-error';
import type { AuditLogEntry, TenantAuditPage } from '../../../../data/models/audit-log';

function entry(id: string, receiptNumber: string, performedBy = 'op-1'): AuditLogEntry {
  return {
    id,
    entityType: 'donation',
    entityId: `d-${id}`,
    action: 'create',
    performedBy,
    previousValues: { receiptNumber },
    newValues: { receiptNumber },
    timestamp: '2026-10-01T10:00:00.000Z',
  };
}

describe('CompanyAudit', () => {
  let listTenantAuditPage: ReturnType<typeof vi.fn>;

  async function render(...pages: (TenantAuditPage | Error)[]) {
    listTenantAuditPage = vi.fn();
    pages.forEach((page) =>
      page instanceof Error
        ? listTenantAuditPage.mockRejectedValueOnce(page)
        : listTenantAuditPage.mockResolvedValueOnce(page),
    );
    const members = [{ userId: 'op-1', name: 'Kojo', email: 'kojo@asante.co' }];
    TestBed.configureTestingModule({
      imports: [CompanyAudit],
      providers: [
        { provide: TenantAuditDataService, useValue: { listTenantAuditPage } },
        { provide: TeamDataService, useValue: { listTeamMembers: async () => members } },
      ],
    });
    const fixture = TestBed.createComponent(CompanyAudit);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows "No activity yet" when the tenant has no entries', async () => {
    const { el } = await render({ entries: [], nextCursor: null });

    expect(el.querySelector('.empty h2')?.textContent).toContain('No activity yet');
    expect(el.querySelector('app-audit-trail-list')).toBeNull();
  });

  it("renders the tenant's entries with team members' names", async () => {
    const { el } = await render({ entries: [entry('a1', 'AK-001')], nextCursor: null });

    expect(el.textContent).toContain('Donation AK-001 created');
    expect(el.textContent).toContain('Kojo (kojo@asante.co)');
    expect(listTenantAuditPage).toHaveBeenCalledWith(null);
  });

  it('labels someone outside the team rather than showing a raw id', async () => {
    const { el } = await render({ entries: [entry('a1', 'AK-001', 'admin-1')], nextCursor: null });

    expect(el.textContent).toContain('Not on your team');
    expect(el.textContent).not.toContain('admin-1');
  });

  it('appends older entries from the next cursor', async () => {
    const { fixture, el } = await render(
      { entries: [entry('a1', 'AK-002')], nextCursor: 'a1' },
      { entries: [entry('a0', 'AK-001')], nextCursor: null },
    );

    (el.querySelector('.page-actions button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(fixture.componentInstance.loadingMore()).toBe(false));
    fixture.detectChanges();

    expect(listTenantAuditPage).toHaveBeenLastCalledWith('a1');
    expect(el.querySelectorAll('.trail-row')).toHaveLength(2);
    expect(el.querySelector('.page-actions')).toBeNull();
  });

  it('shows the error with a retry when the first page fails', async () => {
    const { fixture, el } = await render(new ServiceError('Forbidden'), {
      entries: [entry('a1', 'AK-001')],
      nextCursor: null,
    });

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Forbidden');
    expect(el.querySelector('.empty')).toBeNull();

    await fixture.componentInstance.retry();
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).toContain('Donation AK-001 created');
  });
});
