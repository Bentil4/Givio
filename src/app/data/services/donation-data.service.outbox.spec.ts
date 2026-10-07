import type { DonationDataService } from './donation-data.service';
import { ServiceError } from '../../core/services/service-error';
import { appDb } from '../dexie/app-db';
import {
  clearDonationTables,
  setUpDonationDataService,
  type DonationDataTestBed,
} from './donation-data-test-fixtures';

/** An Operator's outbox: retrying a queued create, and dismissing one the server rejected. */
describe('DonationDataService outbox', () => {
  let service: DonationDataService;
  let functions: DonationDataTestBed['functions'];
  let databases: DonationDataTestBed['databases'];

  beforeEach(async () => {
    ({ service, functions, databases } = await setUpDonationDataService(() => ({ $id: 'op-1' })));
  });

  afterEach(clearDonationTables);

  describe('dismissRejected', () => {
    const donation = {
      id: 'd1',
      eventId: 'e1',
      receiptNumber: 'WEDE1-P1',
      donorName: 'Ama',
      amountMinor: 5000,
      donationType: 'cash' as const,
      recordedBy: 'op-1',
      recordedAt: '2026-01-01T00:00:00.000Z',
      syncStatus: 'failed' as const,
    };
    const addEntry = (status: 'pending' | 'failed') =>
      appDb.outbox.add({
        entityType: 'donation',
        entityId: 'd1',
        op: 'create',
        payload: donation,
        status,
        lastError: status === 'failed' ? 'You are not assigned to this event' : undefined,
        retries: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      });

    it('removes the rejected outbox entry and its local donation, and audits the discard', async () => {
      await appDb.donations.put(donation);
      const localId = await addEntry('failed');

      await service.dismissRejected(localId);

      expect(await appDb.outbox.get(localId)).toBeUndefined();
      expect(await appDb.donations.get('d1')).toBeUndefined();
      expect(databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entityType: 'donation', action: 'delete' }),
        }),
      );
    });

    it('refuses to dismiss an entry that is still pending', async () => {
      await appDb.donations.put({ ...donation, syncStatus: 'pending' });
      const localId = await addEntry('pending');

      await expect(service.dismissRejected(localId)).rejects.toBeInstanceOf(ServiceError);
      expect(await appDb.outbox.get(localId)).toBeDefined();
      expect(await appDb.donations.get('d1')).toBeDefined();
    });
  });

  describe('retryOutboxEntry', () => {
    const donation = {
      id: 'd1',
      eventId: 'e1',
      receiptNumber: 'P-1',
      donorName: 'Ama',
      amountMinor: 5000,
      donationType: 'cash' as const,
      recordedBy: 'op-1',
      recordedAt: '2026-01-01T00:00:00.000Z',
      syncStatus: 'pending' as const,
    };

    it('retries a create entry, writes an audit log on success, and reports synced', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, donation: { receiptNumber: 'WEDE1-1' } }),
      });
      const entry = {
        localId: 1,
        entityType: 'donation' as const,
        entityId: 'd1',
        op: 'create' as const,
        payload: donation,
        status: 'pending' as const,
        retries: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      const outcome = await service.retryOutboxEntry(entry);

      expect(outcome).toBe('synced');
      expect(databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'create' }) }),
      );
    });

    const createEntry = async () => {
      // A fresh copy: a successful sync mutates its payload in place.
      const queued = { ...donation, receiptNumber: 'P-1', syncStatus: 'pending' as const };
      await appDb.donations.put(queued);
      const entry = {
        entityType: 'donation' as const,
        entityId: 'd1',
        op: 'create' as const,
        payload: { ...queued },
        status: 'pending' as const,
        retries: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      const localId = await appDb.outbox.add(entry);
      return { ...entry, localId };
    };

    const respond = (status: number, error = 'Server said no') =>
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: status,
        responseBody: JSON.stringify({ error }),
      });

    it.each([400, 403, 404, 409, 422])(
      'marks a create terminally failed with the reason on a definitive %i',
      async (status) => {
        const entry = await createEntry();
        respond(status, `Rejected with ${status}`);

        const outcome = await service.retryOutboxEntry(entry);

        expect(outcome).toBe('failed');
        const stored = await appDb.outbox.get(entry.localId);
        expect(stored?.status).toBe('failed');
        expect(stored?.lastError).toBe(`Rejected with ${status}`);
        expect((await appDb.donations.get('d1'))?.syncStatus).toBe('failed');
        expect(databases.createRow).not.toHaveBeenCalled();
      },
    );

    it.each([401, 408, 429, 500, 502, 503])(
      'keeps a create pending for retry on a transient %i',
      async (status) => {
        const entry = await createEntry();
        respond(status);

        const outcome = await service.retryOutboxEntry(entry);

        expect(outcome).toBe('pending');
        expect((await appDb.outbox.get(entry.localId))?.status).toBe('pending');
        expect((await appDb.donations.get('d1'))?.syncStatus).toBe('pending');
      },
    );

    it('keeps a create pending when the Function cannot be reached at all', async () => {
      const entry = await createEntry();
      functions.createExecution.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      expect(await service.retryOutboxEntry(entry)).toBe('pending');
      expect((await appDb.outbox.get(entry.localId))?.status).toBe('pending');
    });
  });
});
