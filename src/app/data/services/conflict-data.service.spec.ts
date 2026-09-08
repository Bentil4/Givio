import { TestBed } from '@angular/core/testing';
import { ConflictDataService } from './conflict-data.service';
import { ServiceError } from './service-error';
import { DATABASES, FUNCTIONS } from '../appwrite/client';
import { appDb } from '../dexie/app-db';

const LOCAL_DONATION = { id: 'd1', eventId: 'e1', receiptNumber: 'P-1', donorName: 'Ama (local)' };
const SERVER_DONATION = { id: 'd1', eventId: 'e1', receiptNumber: 'P-1', donorName: 'Ama (server)' };

describe('ConflictDataService', () => {
  let service: ConflictDataService;
  let databases: { listRows: ReturnType<typeof vi.fn> };
  let functions: { createExecution: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    databases = { listRows: vi.fn() };
    functions = { createExecution: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: DATABASES, useValue: databases },
        { provide: FUNCTIONS, useValue: functions },
      ],
    });
    service = TestBed.inject(ConflictDataService);
    await appDb.donations.clear();
  });

  afterEach(async () => {
    await appDb.donations.clear();
  });

  describe('listConflicts', () => {
    it('maps rows into ConflictPair, parsing localVersion/serverVersion back out of JSON', async () => {
      databases.listRows.mockResolvedValueOnce({
        total: 1,
        rows: [
          {
            $id: 'conflict-1',
            receiptNumber: 'P-1',
            localVersion: JSON.stringify(LOCAL_DONATION),
            serverVersion: JSON.stringify(SERVER_DONATION),
            detectedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const pairs = await service.listConflicts();

      expect(pairs).toEqual([
        {
          receiptNumber: 'P-1',
          local: LOCAL_DONATION,
          server: SERVER_DONATION,
          detectedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('only queries unresolved conflicts', async () => {
      databases.listRows.mockResolvedValueOnce({ total: 0, rows: [] });
      await service.listConflicts();

      const queries = databases.listRows.mock.calls[0][0].queries as string[];
      expect(queries.some((q) => q.includes('resolvedAt'))).toBe(true);
    });
  });

  describe('resolveConflict', () => {
    it('rejects with ServiceError when no matching unresolved conflict exists', async () => {
      databases.listRows.mockResolvedValueOnce({ total: 0, rows: [] });
      await expect(service.resolveConflict('P-1', 'keep-server')).rejects.toBeInstanceOf(ServiceError);
      expect(functions.createExecution).not.toHaveBeenCalled();
    });

    it('calls the resolveConflict Function with the conflict row id and updates Dexie', async () => {
      databases.listRows.mockResolvedValueOnce({ total: 1, rows: [{ $id: 'conflict-1' }] });
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, resolution: 'keep-server', donation: SERVER_DONATION }),
      });

      const result = await service.resolveConflict('P-1', 'keep-server');

      expect(result).toEqual(SERVER_DONATION);
      expect((await appDb.donations.get('d1'))?.donorName).toBe('Ama (server)');
      const body = JSON.parse(functions.createExecution.mock.calls[0][0].body);
      expect(body.conflictId).toBe('conflict-1');
      expect(body.resolution).toBe('keep-server');
    });

    it('keep-both also writes the second serverDonation row to Dexie', async () => {
      databases.listRows.mockResolvedValueOnce({ total: 1, rows: [{ $id: 'conflict-1' }] });
      const secondDonation = { ...LOCAL_DONATION, id: 'd2', receiptNumber: 'P-1-B' };
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({
          success: true,
          resolution: 'keep-both',
          donation: secondDonation,
          serverDonation: SERVER_DONATION,
        }),
      });

      await service.resolveConflict('P-1', 'keep-both');

      expect((await appDb.donations.get('d2'))?.receiptNumber).toBe('P-1-B');
      expect((await appDb.donations.get('d1'))?.donorName).toBe('Ama (server)');
    });
  });
});
