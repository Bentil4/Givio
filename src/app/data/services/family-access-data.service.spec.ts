import { TestBed } from '@angular/core/testing';
import { FamilyAccessDataService, FamilyCodeRejectedError } from './family-access-data.service';
import { ServiceError } from '../../core/services/service-error';
import { FUNCTIONS } from '../../core/appwrite/client';

describe('FamilyAccessDataService', () => {
  let service: FamilyAccessDataService;
  let functions: { createExecution: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    functions = { createExecution: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: functions }],
    });
    service = TestBed.inject(FamilyAccessDataService);
  });

  describe('resolveByCode', () => {
    it('calls resolveAccessCode with no admin-specific setup and maps sanitized donations onto the Donation shape', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({
          success: true,
          event: {
            name: 'Ama & Kojo',
            type: 'wedding',
            venue: 'Grand Hall',
            date: '2026-06-01',
            status: 'active',
          },
          donations: [
            {
              id: 'd1',
              donorName: 'Kofi',
              amountMinor: 5000,
              donationType: 'cash',
              onBehalfOf: 'The family',
              recordedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      });

      const result = await service.resolveByCode('ABCD2345');

      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          body: JSON.stringify({ action: 'resolveAccessCode', code: 'ABCD2345' }),
        }),
      );
      expect(result.event.name).toBe('Ama & Kojo');
      expect(result.donations).toEqual([
        {
          id: 'd1',
          eventId: '',
          receiptNumber: 'd1',
          donorName: 'Kofi',
          amountMinor: 5000,
          donationType: 'cash',
          onBehalfOf: 'The family',
          recordedBy: '',
          recordedAt: '2026-01-01T00:00:00.000Z',
          syncStatus: 'synced',
        },
      ]);
    });

    it('throws ServiceError with the generic "not recognised" message on a 404', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 404,
        responseBody: JSON.stringify({ error: 'Code not recognised' }),
      });

      await expect(service.resolveByCode('WRONGCOD')).rejects.toThrow('Code not recognised');
    });

    it('marks a 404 as FamilyCodeRejectedError so an open view can tell "regenerated" from "offline"', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 404,
        responseBody: JSON.stringify({ error: 'Code not recognised' }),
      });

      await expect(service.resolveByCode('OLDCODE1')).rejects.toBeInstanceOf(
        FamilyCodeRejectedError,
      );
    });

    it('does not mark a network failure or a server error as a code rejection', async () => {
      functions.createExecution.mockRejectedValueOnce(new Error('network down'));
      await expect(service.resolveByCode('ABCD2345')).rejects.not.toBeInstanceOf(
        FamilyCodeRejectedError,
      );

      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 500,
        responseBody: JSON.stringify({
          error: 'Server misconfiguration: missing database/table ID',
        }),
      });
      await expect(service.resolveByCode('ABCD2345')).rejects.not.toBeInstanceOf(
        FamilyCodeRejectedError,
      );
    });

    it('propagates a network-level execution failure as ServiceError', async () => {
      functions.createExecution.mockRejectedValueOnce(new Error('network down'));

      await expect(service.resolveByCode('ABCD2345')).rejects.toBeInstanceOf(ServiceError);
    });
  });
});
