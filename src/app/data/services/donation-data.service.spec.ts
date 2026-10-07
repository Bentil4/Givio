import type { DonationDataService } from './donation-data.service';
import { ServiceError } from '../../core/services/service-error';
import { appDb } from '../dexie/app-db';
import {
  clearDonationTables,
  makeEvent,
  setUpDonationDataService,
  type DonationDataTestBed,
  type TestUser,
} from './donation-data-test-fixtures';

/** Reads, createDonation and Realtime. Outbox retries live in the .outbox spec. */
describe('DonationDataService', () => {
  let service: DonationDataService;
  let functions: DonationDataTestBed['functions'];
  let databases: DonationDataTestBed['databases'];
  let realtime: DonationDataTestBed['realtime'];
  let currentUser: TestUser;

  beforeEach(async () => {
    currentUser = { $id: 'op-1' };
    ({ service, functions, databases, realtime } = await setUpDonationDataService(
      () => currentUser,
    ));
  });

  afterEach(clearDonationTables);

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

    it("assigns a provisional receipt number up front, and adopts the Function's canonical number once synced", async () => {
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

    it("rejects with the server's reason and keeps nothing locally when the Function definitively rejects it inline", async () => {
      await appDb.events.put(makeEvent());
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 403,
        responseBody: JSON.stringify({ error: 'You are not assigned to this event' }),
      });

      await expect(
        service.createDonation({
          localId: 'l1',
          eventId: 'e1',
          donorName: 'Ama',
          amountMinor: 5000,
          donationType: 'cash',
        }),
      ).rejects.toThrow('You are not assigned to this event');

      expect(await appDb.outbox.count()).toBe(0);
      expect(await appDb.donations.count()).toBe(0);
    });

    it('keeps the create queued as pending when the Function answers with a 5xx', async () => {
      await appDb.events.put(makeEvent());
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 502,
        responseBody: JSON.stringify({ error: 'Failed to save donation' }),
      });

      const donation = await service.createDonation({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });

      expect((await appDb.donations.get(donation.id))?.syncStatus).toBe('pending');
      expect((await appDb.outbox.toArray())[0].status).toBe('pending');
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
        expect.objectContaining({
          data: expect.objectContaining({ entityType: 'donation', action: 'create' }),
        }),
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

  it("AD-12 amended: an Admin's read writes no access entry — Admin reads of donations are not logged", async () => {
    currentUser = { $id: 'admin-1', labels: ['admin'] };
    databases.listRows.mockResolvedValueOnce({ total: 0, rows: [] });

    await service.listDonationsForEvent('e1');

    expect(databases.createRow).not.toHaveBeenCalled();
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

      const unsubscribe = await service.subscribeToChanges(vi.fn());
      unsubscribe();

      expect(close).toHaveBeenCalledTimes(1);
    });
  });
});
