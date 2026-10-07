import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AdminAudit } from './admin-audit';
import { AuditLogService } from '../../../../data/services/audit-log.service';
import { UserService } from '../../../../data/services/user.service';
import type { AuditLogEntry } from '../../../../data/models/audit-log';

describe('AdminAudit', () => {
  const entries = signal<AuditLogEntry[]>([]);

  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [AdminAudit],
      providers: [
        { provide: AuditLogService, useValue: { entries, loadAuditLogs: vi.fn() } },
        { provide: UserService, useValue: { getUsersById: vi.fn().mockResolvedValue(new Map()) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminAudit);
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("still shows historic Admin access rows alongside other actors' changes (Story 8.2)", async () => {
    entries.set([
      {
        id: 'a1',
        entityType: 'donation',
        entityId: 'e1',
        action: 'access',
        performedBy: 'admin-1',
        previousValues: null,
        newValues: {
          query: 'listDonationsForEvent',
          tenantId: 'tenant-a',
          tenantIds: ['tenant-a'],
          eventId: 'e1',
          eventName: 'Ama & Kojo',
          rowCount: 2,
        },
        timestamp: '2026-09-29T10:00:00.000Z',
      },
      {
        id: 'a2',
        entityType: 'event',
        entityId: '*',
        action: 'access',
        performedBy: 'admin-1',
        previousValues: null,
        newValues: {
          query: 'listEvents',
          tenantId: null,
          tenantIds: ['tenant-a', 'tenant-b'],
          rowCount: 1,
        },
        timestamp: '2026-09-29T09:00:00.000Z',
      },
      {
        id: 'c1',
        entityType: 'donation',
        entityId: 'd1',
        action: 'create',
        performedBy: 'op-1',
        previousValues: { receiptNumber: 'AK-001' },
        newValues: { receiptNumber: 'AK-001' },
        timestamp: '2026-09-29T08:00:00.000Z',
      },
    ]);

    const text = (await render()).textContent ?? '';

    expect(text).toContain('Viewed 2 donations for Ama & Kojo');
    expect(text).toContain('Tenant tenant-a');
    expect(text).toContain('Viewed all events (1 event)');
    expect(text).toContain('Across 2 tenants');
    expect(text).toContain('Donation AK-001 created');
  });

  it('AD-12 amended: no longer offers an Access filter — Admin reads of company data are not logged any more', async () => {
    entries.set([]);
    const el = await render();

    const filters = [...el.querySelectorAll('.filter-tag')].map((b) => b.textContent?.trim());
    expect(filters).toContain('Edit');
    expect(filters).not.toContain('Access');
  });
});
