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

/** Reads, createDonation and Realtime. Edits and sync live in the .edits spec. */
describe('DonationDataService', () => {
  let service: DonationDataService;
  let functions: DonationDataTestBed['functions'];
  let databases: DonationDataTestBed['databases'];
  let realtime: DonationDataTestBed['realtime'];
  // No labels by default, so no pre-existing test sees an extra Story 8.2 access-log createRow.
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

  describe('Admin access logging (Story 8.2)', () => {
    const makeRow = (id: string, eventId: string) => ({
      $id: id,
      eventId,
      receiptNumber: `R-${id}`,
      donorName: 'Esi',
      amountMinor: 3000,
      donationType: 'cash',
      recordedBy: 'op-2',
      recordedAt: '2026-01-01T00:00:00.000Z',
      syncStatus: 'synced',
    });
    const accessLogWrites = () =>
      databases.createRow.mock.calls.filter(([arg]) => arg.data?.action === 'access');
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    beforeEach(() => {
      currentUser = { $id: 'admin-1', labels: ['admin'] };
    });

    it('listAllDonations writes exactly one entry recording every tenant it touched', async () => {
      await appDb.events.bulkPut([
        makeEvent({ id: 'e1', tenantId: 'tenant-a' }),
        makeEvent({ id: 'e2', tenantId: 'tenant-b' }),
      ]);
      databases.listRows.mockResolvedValueOnce({
        total: 4,
        rows: [makeRow('d1', 'e1'), makeRow('d2', 'e1'), makeRow('d3', 'e2'), makeRow('d4', 'e3')],
      });

      await service.listAllDonations();
      await vi.waitFor(() => expect(accessLogWrites()).toHaveLength(1));
      await flush();

      expect(accessLogWrites()).toHaveLength(1);
      const { data } = accessLogWrites()[0][0];
      expect(data).toMatchObject({
        entityType: 'donation',
        entityId: '*',
        action: 'access',
        performedBy: 'admin-1',
      });
      expect(JSON.parse(data.newValues)).toEqual({
        query: 'listAllDonations',
        tenantId: null,
        tenantIds: ['tenant-a', 'tenant-b'],
        rowCount: 4,
      });
    });

    it("listDonationsForEvent writes one entry naming the event's tenant", async () => {
      await appDb.events.put(makeEvent({ id: 'e1', tenantId: 'tenant-a' }));
      databases.listRows.mockResolvedValueOnce({
        total: 2,
        rows: [makeRow('d1', 'e1'), makeRow('d2', 'e1')],
      });

      await service.listDonationsForEvent('e1');
      await vi.waitFor(() => expect(accessLogWrites()).toHaveLength(1));

      const { data } = accessLogWrites()[0][0];
      expect(data).toMatchObject({ entityType: 'donation', entityId: 'e1', action: 'access' });
      expect(JSON.parse(data.newValues)).toEqual({
        query: 'listDonationsForEvent',
        tenantId: 'tenant-a',
        tenantIds: ['tenant-a'],
        eventId: 'e1',
        eventName: 'Ama & Kojo',
        rowCount: 2,
      });
    });

    it('writes nothing for an Operator read', async () => {
      currentUser = { $id: 'op-1', labels: ['operator'] };
      databases.listRows.mockResolvedValue({ total: 1, rows: [makeRow('d1', 'e1')] });

      await service.listDonationsForEvent('e1');
      await service.listAllDonations();
      await flush();

      expect(databases.createRow).not.toHaveBeenCalled();
    });

    it('still returns the donations when the audit write fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      databases.createRow.mockRejectedValue(new Error('enum value not allowed'));
      databases.listRows.mockResolvedValueOnce({ total: 1, rows: [makeRow('d1', 'e1')] });

      const result = await service.listAllDonations();
      await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());

      expect(result.map((d) => d.id)).toEqual(['d1']);
      consoleError.mockRestore();
    });

    it('writes nothing when the read fell back to the offline local cache', async () => {
      databases.listRows.mockRejectedValueOnce(new Error('offline'));

      await service.listAllDonations();
      await flush();

      expect(databases.createRow).not.toHaveBeenCalled();
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

      const unsubscribe = await service.subscribeToChanges(vi.fn());
      unsubscribe();

      expect(close).toHaveBeenCalledTimes(1);
    });
  });
});
