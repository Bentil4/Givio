import { TestBed } from '@angular/core/testing';
import { AuditLogDataService } from './audit-log-data.service';
import { DATABASES } from '../../core/appwrite/client';

describe('AuditLogDataService', () => {
  let service: AuditLogDataService;
  let databases: { listRows: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    databases = { listRows: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: DATABASES, useValue: databases }],
    });
    service = TestBed.inject(AuditLogDataService);
  });

  it('maps rows into AuditLogEntry, parsing previousValues/newValues back out of JSON', async () => {
    databases.listRows.mockResolvedValueOnce({
      total: 1,
      rows: [
        {
          $id: 'log-1',
          entityType: 'donation',
          entityId: 'd1',
          action: 'edit',
          performedBy: 'admin-1',
          previousValues: JSON.stringify({ donorName: 'Ama' }),
          newValues: JSON.stringify({ donorName: 'Ama Serwaa', reason: 'Spelling' }),
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const entries = await service.listAuditLogs();

    expect(entries).toEqual([
      {
        id: 'log-1',
        entityType: 'donation',
        entityId: 'd1',
        action: 'edit',
        performedBy: 'admin-1',
        previousValues: { donorName: 'Ama' },
        newValues: { donorName: 'Ama Serwaa', reason: 'Spelling' },
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('orders by timestamp descending and paginates via cursor', async () => {
    databases.listRows.mockResolvedValueOnce({ total: 0, rows: [] });
    await service.listAuditLogs();

    const queries = databases.listRows.mock.calls[0][0].queries as string[];
    expect(queries.some((q) => q.includes('timestamp'))).toBe(true);
  });

  it('propagates a failure rather than silently returning an empty list', async () => {
    databases.listRows.mockRejectedValueOnce(new Error('offline'));
    await expect(service.listAuditLogs()).rejects.toThrow('offline');
  });

  it('reads only the newest entries for a summary, in one request', async () => {
    databases.listRows.mockResolvedValueOnce({ total: 0, rows: [] });

    await service.listRecentAuditLogs(8);

    expect(databases.listRows).toHaveBeenCalledTimes(1);
    const queries = databases.listRows.mock.calls[0][0].queries as string[];
    expect(queries.some((q) => q.includes('orderDesc') && q.includes('timestamp'))).toBe(true);
    expect(queries.some((q) => q.includes('limit') && q.includes('8'))).toBe(true);
  });
});
