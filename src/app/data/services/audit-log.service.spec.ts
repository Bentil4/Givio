import { TestBed } from '@angular/core/testing';
import { AuditLogService } from './audit-log.service';
import { AuditLogDataService } from './audit-log-data.service';
import type { AuditLogEntry } from '../models/audit-log';

describe('AuditLogService', () => {
  it('loadAuditLogs delegates to AuditLogDataService and populates the entries signal', async () => {
    const entry: AuditLogEntry = {
      id: 'log-1',
      entityType: 'event',
      entityId: 'e1',
      action: 'edit',
      performedBy: 'admin-1',
      previousValues: {},
      newValues: {},
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    const auditLogDataService = { listAuditLogs: vi.fn().mockResolvedValue([entry]) };
    TestBed.configureTestingModule({
      providers: [{ provide: AuditLogDataService, useValue: auditLogDataService }],
    });
    const service = TestBed.inject(AuditLogService);

    await service.loadAuditLogs();

    expect(service.entries()).toEqual([entry]);
  });
});
