import { TestBed } from '@angular/core/testing';
import { TenantAuditDataService } from './tenant-audit-data.service';
import { FUNCTIONS } from '../../core/appwrite/client';

describe('TenantAuditDataService', () => {
  let service: TenantAuditDataService;
  let createExecution: ReturnType<typeof vi.fn>;

  const respond = (status: number, body: object) =>
    createExecution.mockResolvedValueOnce({
      responseStatusCode: status,
      responseBody: JSON.stringify(body),
    });
  const sentBody = () => JSON.parse(createExecution.mock.calls[0][0].body);

  beforeEach(() => {
    createExecution = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: { createExecution } }],
    });
    service = TestBed.inject(TenantAuditDataService);
  });

  it('never sends a tenantId — the Function resolves it from the caller', async () => {
    respond(200, { entries: [], nextCursor: null });

    await service.listTenantAuditPage(null);

    expect(sentBody()).toEqual({ action: 'listTenantAuditLog' });
  });

  it('passes the cursor and parses the stored JSON values back out', async () => {
    respond(200, {
      entries: [
        {
          $id: 'a1',
          entityType: 'donation',
          entityId: 'd1',
          action: 'create',
          performedBy: 'op-1',
          previousValues: '{"receiptNumber":"AK-001"}',
          newValues: '{"receiptNumber":"AK-001"}',
          timestamp: '2026-10-01T10:00:00.000Z',
        },
      ],
      nextCursor: 'a1',
    });

    const page = await service.listTenantAuditPage('a0');

    expect(sentBody()).toEqual({ action: 'listTenantAuditLog', cursor: 'a0' });
    expect(page.nextCursor).toBe('a1');
    expect(page.entries[0].newValues).toEqual({ receiptNumber: 'AK-001' });
  });

  it("surfaces the Function's refusal message", async () => {
    respond(403, { error: 'Forbidden' });

    await expect(service.listTenantAuditPage(null)).rejects.toThrow('Forbidden');
  });
});
