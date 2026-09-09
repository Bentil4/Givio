import { TestBed } from '@angular/core/testing';
import { DonationDataService } from './donation-data.service';
import { ServiceError } from './service-error';
import { AuthService } from './auth.service';
import { DATABASES, FUNCTIONS, REALTIME } from '../appwrite/client';
import { appDb } from '../dexie/app-db';
import type { Event } from '../models/event';

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Ama & Kojo',
  type: 'wedding',
  date: '2026-06-01',
  hostName: 'The Mensah Family',
  status: 'active',
  assignedUserIds: ['op-1', 'op-2'],
  createdBy: 'admin-1',
  nextReceiptSeq: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('DonationDataService', () => {
  let service: DonationDataService;
  let functions: { createExecution: ReturnType<typeof vi.fn> };
  let databases: {
    listRows: ReturnType<typeof vi.fn>;
    updateRow: ReturnType<typeof vi.fn>;
    createRow: ReturnType<typeof vi.fn>;
    getRow: ReturnType<typeof vi.fn>;
  };
  let realtime: { subscribe: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    functions = { createExecution: vi.fn() };
    databases = {
      listRows: vi.fn().mockResolvedValue({ total: 0, rows: [] }),
      updateRow: vi.fn().mockResolvedValue({}),
      createRow: vi.fn().mockResolvedValue({}),
      // No `updatedAt` (undefined -> null) matches a freshly-seeded donation's own baseUpdatedAt
      // (also undefined -> null) by default — individual conflict tests override this.
      getRow: vi.fn().mockResolvedValue({}),
    };
    realtime = { subscribe: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) }) };
    TestBed.configureTestingModule({
      providers: [
        { provide: FUNCTIONS, useValue: functions },
        { provide: DATABASES, useValue: databases },
        { provide: REALTIME, useValue: realtime },
        { provide: AuthService, useValue: { currentUser: () => ({ $id: 'op-1' }) } },
      ],
    });
    service = TestBed.inject(DonationDataService);
    await appDb.events.clear();
    await appDb.donations.clear();
    await appDb.outbox.clear();
  });

  afterEach(async () => {
    await appDb.events.clear();
    await appDb.donations.clear();
    await appDb.outbox.clear();
  });

  describe('listDonationsForEvent', () => {
    it('returns only donations for the given event', async () => {
      await appDb.donations.bulkPut([
        {
          id: 'd1',
          eventId: 'e1',
          receiptNumber: 'P-1',
          donorName: 'Ama',
          amountMinor: 5000,
          donationType: 'cash',
          recordedBy: 'op-1',
          recordedAt: '2026-01-01T00:00:00.000Z',
          syncStatus: 'synced',
        },
        {
          id: 'd2',
          eventId: 'other-event',
          receiptNumber: 'P-2',
          donorName: 'Kofi',
          amountMinor: 1000,
          donationType: 'cash',
          recordedBy: 'op-1',
          recordedAt: '2026-01-01T00:00:00.000Z',
          syncStatus: 'synced',
        },
      ]);

      const result = await service.listDonationsForEvent('e1');

      expect(result.map((d) => d.id)).toEqual(['d1']);
    });

    it('hydrates Dexie from Appwrite and returns the merged local list', async () => {
      databases.listRows.mockResolvedValueOnce({
        total: 1,
        rows: [
          {
            $id: 'remote-1',
            eventId: 'e1',
            receiptNumber: 'P-9',
            donorName: 'Remote Donor',
            amountMinor: 20000,
            donationType: 'cash',
            recordedBy: 'op-2',
            recordedAt: '2026-01-01T00:00:00.000Z',
            syncStatus: 'synced',
          },
        ],
      });

      const result = await service.listDonationsForEvent('e1');

      expect(result.map((d) => d.id)).toEqual(['remote-1']);
      expect(await appDb.donations.get('remote-1')).toMatchObject({ donorName: 'Remote Donor' });
    });

    it('does not overwrite a donation with an unsynced outbox entry', async () => {
      await appDb.donations.put({
        id: 'remote-1',
        eventId: 'e1',
        receiptNumber: 'P-9',
        donorName: 'Local Unsynced Edit',
        amountMinor: 5000,
        donationType: 'cash',
        recordedBy: 'op-1',
        recordedAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending',
      });
      await appDb.outbox.add({
        entityType: 'donation',
        entityId: 'remote-1',
        op: 'create',
        payload: {},
        status: 'pending',
        retries: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      databases.listRows.mockResolvedValueOnce({
        total: 1,
        rows: [
          {
            $id: 'remote-1',
            eventId: 'e1',
            receiptNumber: 'P-9',
            donorName: 'Stale Server Name',
            amountMinor: 20000,
            donationType: 'cash',
            recordedBy: 'op-2',
            recordedAt: '2026-01-01T00:00:00.000Z',
            syncStatus: 'synced',
          },
        ],
      });

      const result = await service.listDonationsForEvent('e1');

      expect(result.find((d) => d.id === 'remote-1')?.donorName).toBe('Local Unsynced Edit');
    });

    it('falls back to the local list when the remote fetch fails', async () => {
      await appDb.donations.put({
        id: 'local-only',
        eventId: 'e1',
        receiptNumber: 'P-1',
        donorName: 'Offline Donor',
        amountMinor: 5000,
        donationType: 'cash',
        recordedBy: 'op-1',
        recordedAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'synced',
      });
      databases.listRows.mockRejectedValueOnce(new Error('offline'));

      const result = await service.listDonationsForEvent('e1');

      expect(result.map((d) => d.id)).toEqual(['local-only']);
    });
  });

  describe('createDonation', () => {
    it('rejects with ServiceError when the event does not exist', async () => {
      await expect(
        service.createDonation({
          localId: 'l1',
          eventId: 'missing',
          donorName: 'Ama',
          amountMinor: 5000,
          donationType: 'cash',
        }),
      ).rejects.toBeInstanceOf(ServiceError);
    });

    it('rejects with ServiceError when the event is paused or closed', async () => {
      await appDb.events.put(makeEvent({ status: 'paused' }));

      await expect(
        service.createDonation({
          localId: 'l1',
          eventId: 'e1',
          donorName: 'Ama',
          amountMinor: 5000,
          donationType: 'cash',
        }),
      ).rejects.toBeInstanceOf(ServiceError);
    });

    it('assigns a provisional receipt number up front, and adopts the Function\'s canonical number once synced', async () => {
      await appDb.events.put(makeEvent());
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, donation: { receiptNumber: 'WEDE1-1' } }),
      });

      const donation = await service.createDonation({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });

      expect(donation.recordedBy).toBe('op-1');
      expect(await appDb.donations.get(donation.id)).toMatchObject({ donorName: 'Ama' });
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('"action":"recordDonation"'),
        }),
      );
      const body = JSON.parse(functions.createExecution.mock.calls[0][0].body);
      expect(body.donationId).toBe(donation.id);
      expect(body.eventId).toBe('e1');
      // The provisional number sent up (what the Function saw before assigning canonical).
      expect(body.receiptNumber).toMatch(/-P1$/);
      // The local record ends up carrying the Function's canonical number, not the provisional one.
      expect(donation.receiptNumber).toBe('WEDE1-1');
      expect((await appDb.donations.get(donation.id))?.receiptNumber).toBe('WEDE1-1');
    });

    it('generates a distinct provisional number for each still-pending donation on the same event', async () => {
      await appDb.events.put(makeEvent());
      functions.createExecution.mockRejectedValue(new Error('offline'));

      const first = await service.createDonation({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });
      const second = await service.createDonation({
        localId: 'l2',
        eventId: 'e1',
        donorName: 'Kofi',
        amountMinor: 2000,
        donationType: 'cash',
      });

      expect(first.receiptNumber).toMatch(/-P1$/);
      expect(second.receiptNumber).toMatch(/-P2$/);
      expect(first.receiptNumber).not.toBe(second.receiptNumber);
    });

    it('still resolves with the created Donation when the Function call fails (offline path)', async () => {
      await appDb.events.put(makeEvent());
      functions.createExecution.mockRejectedValueOnce(new Error('offline'));

      const donation = await service.createDonation({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });

      expect(donation.id).toBeTruthy();
      const pending = (await appDb.outbox.toArray()).filter((e) => e.entityId === donation.id);
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('pending');
      expect((await appDb.donations.get(donation.id))?.syncStatus).toBe('pending');
    });

    it('still resolves with the created Donation when the Function rejects the request', async () => {
      await appDb.events.put(makeEvent());
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 403,
        responseBody: JSON.stringify({ error: 'You are not assigned to this event' }),
      });

      const donation = await service.createDonation({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });

      expect(donation.id).toBeTruthy();
      expect((await appDb.donations.get(donation.id))?.syncStatus).toBe('pending');
    });

    it('marks the local record synced and clears the outbox entry once the Function succeeds', async () => {
      await appDb.events.put(makeEvent());
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, donation: { receiptNumber: 'WEDE1-1' } }),
      });

      const donation = await service.createDonation({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });

      expect((await appDb.donations.get(donation.id))?.syncStatus).toBe('synced');
      const pending = (await appDb.outbox.toArray()).filter((e) => e.entityId === donation.id);
      expect(pending).toHaveLength(0);
      expect(databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ entityType: 'donation', action: 'create' }) }),
      );
    });

    it('skips the audit log when the create sync is left pending (offline)', async () => {
      await appDb.events.put(makeEvent());
      functions.createExecution.mockRejectedValueOnce(new Error('offline'));

      await service.createDonation({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });

      expect(databases.createRow).not.toHaveBeenCalled();
    });
  });

  describe('listAllDonations', () => {
    it('pulls without an eventId filter', async () => {
      databases.listRows.mockResolvedValueOnce({
        total: 1,
        rows: [
          {
            $id: 'any-event',
            eventId: 'e9',
            receiptNumber: 'P-3',
            donorName: 'Esi',
            amountMinor: 3000,
            donationType: 'cash',
            recordedBy: 'op-2',
            recordedAt: '2026-01-01T00:00:00.000Z',
            syncStatus: 'synced',
          },
        ],
      });

      const result = await service.listAllDonations();

      expect(result.map((d) => d.id)).toEqual(['any-event']);
      const queries = databases.listRows.mock.calls[0][0].queries as string[];
      expect(queries.some((q) => q.includes('eventId'))).toBe(false);
    });
  });

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
        expect.objectContaining({ rowId: 'd1', data: expect.objectContaining({ donorName: 'Ama Serwaa' }) }),
      );
      expect(databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ entityType: 'donation', action: 'edit' }) }),
      );
    });

    it('still resolves with the local update when updateRow rejects (offline), and skips the audit log', async () => {
      await seed();
      databases.updateRow.mockRejectedValueOnce(new Error('offline'));

      const updated = await service.updateDonation('d1', { donorName: 'Offline Edit' }, 'reason text here');

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

    it('applies the update normally when the server row\'s updatedAt still matches baseUpdatedAt', async () => {
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
        donorName: 'Ama (someone else\'s edit)',
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
      expect(body.serverVersion.donorName).toBe('Ama (someone else\'s edit)');
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

  describe('subscribeToChanges', () => {
    it('subscribes to the donations table and invokes onChange on every event', async () => {
      const onChange = vi.fn();
      await service.subscribeToChanges(onChange);

      expect(realtime.subscribe).toHaveBeenCalledTimes(1);
      const callback = realtime.subscribe.mock.calls[0][1] as () => void;
      callback();
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('the returned unsubscribe closes the underlying subscription', async () => {
      const close = vi.fn().mockResolvedValue(undefined);
      realtime.subscribe.mockResolvedValueOnce({ close });

      const unsubscribe = await service.subscribeToChanges(() => {});
      unsubscribe();

      expect(close).toHaveBeenCalledTimes(1);
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
