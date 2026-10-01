import { AppwriteException } from 'appwrite';
import type { DonationDataService } from './donation-data.service';
import { ServiceError } from '../../core/services/service-error';
import { appDb } from '../dexie/app-db';
import {
  clearDonationTables,
  setUpDonationDataService,
  type DonationDataTestBed,
  type TestUser,
} from './donation-data-test-fixtures';

/** Edits, soft delete/recover, conflicts and outbox retries. */
describe('DonationDataService', () => {
  let service: DonationDataService;
  let functions: DonationDataTestBed['functions'];
  let databases: DonationDataTestBed['databases'];
  // No labels by default, so no pre-existing test sees an extra Story 8.2 access-log createRow.
  let currentUser: TestUser;

  beforeEach(async () => {
    currentUser = { $id: 'op-1' };
    ({ service, functions, databases } = await setUpDonationDataService(() => currentUser));
  });

  afterEach(clearDonationTables);

  describe('updateDonation', () => {
    const seed = async (overrides: Partial<import('../models/donation').Donation> = {}) => {
      const donation = {
        id: 'd1',
        eventId: 'e1',
        receiptNumber: 'P-1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash' as const,
        recordedBy: 'op-1',
        recordedAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
        ...overrides,
      };
      await appDb.donations.put(donation);
      return donation;
    };

    it('rejects with ServiceError for an unknown id', async () => {
      await expect(
        service.updateDonation('missing', { donorName: 'X' }, 'Fixed a typo in the name'),
      ).rejects.toBeInstanceOf(ServiceError);
    });

    it('rejects with ServiceError when the donation is deleted', async () => {
      await seed({ deletedAt: '2026-02-01T00:00:00.000Z' });
      await expect(
        service.updateDonation('d1', { donorName: 'X' }, 'Fixed a typo in the name'),
      ).rejects.toBeInstanceOf(ServiceError);
    });

    it('writes the merged patch to Dexie, calls updateRow, and writes an audit log', async () => {
      await seed();

      const updated = await service.updateDonation(
        'd1',
        { donorName: 'Ama Serwaa' },
        'Corrected spelling per donor request',
      );

      expect(updated.donorName).toBe('Ama Serwaa');
      expect(updated.updatedAt).toBeTruthy();
      expect((await appDb.donations.get('d1'))?.donorName).toBe('Ama Serwaa');
      expect(databases.updateRow).toHaveBeenCalledWith(
        expect.objectContaining({
          rowId: 'd1',
          data: expect.objectContaining({ donorName: 'Ama Serwaa' }),
        }),
      );
      expect(databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entityType: 'donation', action: 'edit' }),
        }),
      );
    });

    it('reverts the local row and rejects with the reason when updateRow is definitively refused', async () => {
      await seed();
      databases.updateRow.mockRejectedValueOnce(
        new AppwriteException('Invalid document structure: Unknown attribute: "updatedAt"', 400),
      );

      await expect(
        service.updateDonation('d1', { donorName: 'Ama Serwaa' }, 'Spelling fix'),
      ).rejects.toThrow('Unknown attribute');

      expect((await appDb.donations.get('d1'))?.donorName).toBe('Ama');
      expect((await appDb.donations.get('d1'))?.syncStatus).toBe('synced');
      expect(await appDb.outbox.count()).toBe(0);
    });

    it('still resolves with the local update when updateRow rejects (offline), and skips the audit log', async () => {
      await seed();
      databases.updateRow.mockRejectedValueOnce(new Error('offline'));

      const updated = await service.updateDonation(
        'd1',
        { donorName: 'Offline Edit' },
        'reason text here',
      );

      expect(updated.donorName).toBe('Offline Edit');
      expect(databases.createRow).not.toHaveBeenCalled();
      const pending = (await appDb.outbox.toArray()).filter((e) => e.entityId === 'd1');
      expect(pending).toHaveLength(1);
    });
  });

  describe('conflict detection (AD-3)', () => {
    const seed = async (overrides: Partial<import('../models/donation').Donation> = {}) => {
      const donation = {
        id: 'd1',
        eventId: 'e1',
        receiptNumber: 'P-1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash' as const,
        recordedBy: 'op-1',
        recordedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
        ...overrides,
      };
      await appDb.donations.put(donation);
      return donation;
    };

    it("applies the update normally when the server row's updatedAt still matches baseUpdatedAt", async () => {
      await seed();
      databases.getRow.mockResolvedValueOnce({ updatedAt: '2026-02-01T00:00:00.000Z' });

      const updated = await service.updateDonation('d1', { donorName: 'Ama Serwaa' }, 'Spelling');

      expect(updated.syncStatus).toBe('synced');
      expect(databases.updateRow).toHaveBeenCalled();
      expect(functions.createExecution).not.toHaveBeenCalled();
    });

    it('files a conflict via the Function instead of overwriting when updatedAt has moved on', async () => {
      await seed();
      databases.getRow.mockResolvedValueOnce({
        $id: 'd1',
        eventId: 'e1',
        receiptNumber: 'P-1',
        donorName: "Ama (someone else's edit)",
        recordedBy: 'op-1',
        recordedAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'synced',
        updatedAt: '2026-02-02T00:00:00.000Z', // moved on since this edit's baseUpdatedAt
      });
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, conflictId: 'conflict-1' }),
      });

      const updated = await service.updateDonation('d1', { donorName: 'Ama Serwaa' }, 'Spelling');

      expect(updated.syncStatus).toBe('conflict');
      expect((await appDb.donations.get('d1'))?.syncStatus).toBe('conflict');
      expect(databases.updateRow).not.toHaveBeenCalled();
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('"action":"recordConflict"') }),
      );
      const body = JSON.parse(functions.createExecution.mock.calls[0][0].body);
      expect(body.receiptNumber).toBe('P-1');
      expect(body.localVersion.donorName).toBe('Ama Serwaa');
      expect(body.serverVersion.donorName).toBe("Ama (someone else's edit)");
      // The conflict is on record — no audit log for an edit that was never actually applied.
      expect(databases.createRow).not.toHaveBeenCalled();
      // Filed successfully — nothing left to retry.
      const pending = (await appDb.outbox.toArray()).filter((e) => e.entityId === 'd1');
      expect(pending).toHaveLength(0);
    });

    it('leaves the outbox entry pending when the conflict cannot even be filed (offline)', async () => {
      await seed();
      databases.getRow.mockResolvedValueOnce({ updatedAt: '2026-02-02T00:00:00.000Z' });
      functions.createExecution.mockRejectedValueOnce(new Error('offline'));

      const updated = await service.updateDonation('d1', { donorName: 'Ama Serwaa' }, 'Spelling');

      expect(updated.syncStatus).toBe('pending');
      const pending = (await appDb.outbox.toArray()).filter((e) => e.entityId === 'd1');
      expect(pending).toHaveLength(1);
    });
  });

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

  describe('softDeleteDonation / recoverDonation', () => {
    const seed = async (overrides: Partial<import('../models/donation').Donation> = {}) => {
      const donation = {
        id: 'd1',
        eventId: 'e1',
        receiptNumber: 'P-1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash' as const,
        recordedBy: 'op-1',
        recordedAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
        ...overrides,
      };
      await appDb.donations.put(donation);
      return donation;
    };

    it('softDeleteDonation sets deletedAt/deletedBy/deletionReason and logs a delete audit entry', async () => {
      await seed();

      const deleted = await service.softDeleteDonation('d1', 'Duplicate entry, recorded twice');

      expect(deleted.deletedAt).toBeTruthy();
      expect(deleted.deletedBy).toBe('op-1');
      expect(deleted.deletionReason).toBe('Duplicate entry, recorded twice');
      expect(databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'delete' }) }),
      );
    });

    it('softDeleteDonation rejects with ServiceError when already deleted', async () => {
      await seed({ deletedAt: '2026-02-01T00:00:00.000Z' });
      await expect(service.softDeleteDonation('d1', 'reason text here')).rejects.toBeInstanceOf(
        ServiceError,
      );
    });

    it('recoverDonation clears deletedAt/deletedBy/deletionReason and logs a restore audit entry', async () => {
      await seed({
        deletedAt: '2026-02-01T00:00:00.000Z',
        deletedBy: 'admin-1',
        deletionReason: 'Duplicate entry',
      });

      const recovered = await service.recoverDonation('d1');

      expect(recovered.deletedAt).toBeNull();
      expect(recovered.deletedBy).toBeUndefined();
      expect(recovered.deletionReason).toBeUndefined();
      expect(databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'restore' }) }),
      );
    });

    it('recoverDonation rejects with ServiceError when not deleted', async () => {
      await seed();
      await expect(service.recoverDonation('d1')).rejects.toBeInstanceOf(ServiceError);
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

    it('marks an update terminally failed on a definitive Appwrite 404', async () => {
      await appDb.donations.put(donation);
      databases.getRow.mockRejectedValueOnce(
        new AppwriteException('Row with the requested ID could not be found.', 404),
      );
      const entry = {
        entityType: 'donation' as const,
        entityId: 'd1',
        op: 'update' as const,
        payload: { ...donation, donorName: 'Ama Serwaa' },
        status: 'pending' as const,
        retries: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      const localId = await appDb.outbox.add(entry);

      const outcome = await service.retryOutboxEntry({ ...entry, localId });

      expect(outcome).toBe('failed');
      expect((await appDb.outbox.get(localId))?.status).toBe('failed');
      expect((await appDb.donations.get('d1'))?.syncStatus).toBe('failed');
    });

    it('keeps an update pending on a transient Appwrite 503', async () => {
      await appDb.donations.put(donation);
      databases.getRow.mockRejectedValueOnce(new AppwriteException('Service unavailable', 503));
      const entry = {
        entityType: 'donation' as const,
        entityId: 'd1',
        op: 'update' as const,
        payload: { ...donation },
        status: 'pending' as const,
        retries: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      const localId = await appDb.outbox.add(entry);

      expect(await service.retryOutboxEntry({ ...entry, localId })).toBe('pending');
      expect((await appDb.outbox.get(localId))?.status).toBe('pending');
    });

    it("does not attempt an update while that donation's own create is still queued", async () => {
      await createEntry();
      const entry = {
        entityType: 'donation' as const,
        entityId: 'd1',
        op: 'update' as const,
        payload: { ...donation, donorName: 'Ama Serwaa' },
        status: 'pending' as const,
        retries: 0,
        createdAt: '2026-01-01T00:00:01.000Z',
      };
      const localId = await appDb.outbox.add(entry);

      expect(await service.retryOutboxEntry({ ...entry, localId })).toBe('pending');
      expect(databases.getRow).not.toHaveBeenCalled();
    });

    it('retries an update entry via the same conflict-aware path, without an audit log', async () => {
      await appDb.donations.put(donation);
      databases.getRow.mockResolvedValueOnce({});
      const entry = {
        localId: 2,
        entityType: 'donation' as const,
        entityId: 'd1',
        op: 'update' as const,
        payload: { ...donation, donorName: 'Ama Serwaa' },
        status: 'pending' as const,
        retries: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      const outcome = await service.retryOutboxEntry(entry);

      expect(outcome).toBe('synced');
      expect((await appDb.donations.get('d1'))?.donorName).toBe('Ama Serwaa');
      expect((await appDb.donations.get('d1'))?.syncStatus).toBe('synced');
      expect(databases.createRow).not.toHaveBeenCalled();
    });
  });
});
