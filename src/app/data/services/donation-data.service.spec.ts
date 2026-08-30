import { TestBed } from '@angular/core/testing';
import { DonationDataService } from './donation-data.service';
import { ServiceError } from './service-error';
import { AuthService } from './auth.service';
import { FUNCTIONS } from '../appwrite/client';
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

  beforeEach(async () => {
    functions = { createExecution: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: FUNCTIONS, useValue: functions },
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

    it('writes to Dexie, assigns a provisional receipt number, and calls the recordDonation Function', async () => {
      await appDb.events.put(makeEvent());
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true }),
      });

      const donation = await service.createDonation({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });

      expect(donation.receiptNumber).toMatch(/^P-/);
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
      expect(body.receiptNumber).toBe(donation.receiptNumber);
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
        responseBody: JSON.stringify({ success: true }),
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
    });
  });
});
