import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SyncEngineService } from './sync-engine.service';
import { ConnectivityService } from './connectivity.service';
import { EventDataService } from './event-data.service';
import { DonationDataService } from './donation-data.service';
import { appDb } from '../dexie/app-db';
import type { OutboxEntry } from '../dexie/outbox-entry';

describe('SyncEngineService', () => {
  let online: ReturnType<typeof signal<boolean>>;
  let eventDataService: { retryOutboxEntry: ReturnType<typeof vi.fn> };
  let donationDataService: { retryOutboxEntry: ReturnType<typeof vi.fn> };
  let service: SyncEngineService;

  beforeEach(async () => {
    online = signal(true);
    eventDataService = { retryOutboxEntry: vi.fn().mockResolvedValue(true) };
    donationDataService = { retryOutboxEntry: vi.fn().mockResolvedValue('synced') };

    TestBed.configureTestingModule({
      providers: [
        { provide: ConnectivityService, useValue: { online } },
        { provide: EventDataService, useValue: eventDataService },
        { provide: DonationDataService, useValue: donationDataService },
      ],
    });
    service = TestBed.inject(SyncEngineService);
    await appDb.outbox.clear();
  });

  afterEach(async () => {
    await appDb.outbox.clear();
  });

  const addOutboxEntry = (overrides: Partial<OutboxEntry> = {}) =>
    appDb.outbox.add({
      entityType: 'donation',
      entityId: 'd1',
      op: 'create',
      payload: {},
      status: 'pending',
      retries: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    });

  it('refreshPendingCount reflects the outbox size', async () => {
    await addOutboxEntry();
    await addOutboxEntry({ entityId: 'd2' });

    await service.refreshPendingCount();

    expect(service.pendingCount()).toBe(2);
  });

  it('drainOutbox dispatches each entry to the matching data service by entityType', async () => {
    await addOutboxEntry({ entityType: 'donation', entityId: 'd1' });
    await addOutboxEntry({ entityType: 'event', entityId: 'e1' });

    await service.drainOutbox();

    expect(donationDataService.retryOutboxEntry).toHaveBeenCalledTimes(1);
    expect(eventDataService.retryOutboxEntry).toHaveBeenCalledTimes(1);
  });

  it('drainOutbox refreshes the pending count afterward and clears the syncing flag', async () => {
    const localId = await addOutboxEntry();
    // A real retryOutboxEntry deletes the outbox row on success — the fake mirrors that so
    // the post-drain refresh has something real to observe.
    donationDataService.retryOutboxEntry.mockImplementationOnce(async () => {
      await appDb.outbox.delete(localId);
      return 'synced';
    });

    const drain = service.drainOutbox();
    expect(service.syncing()).toBe(true);
    await drain;

    expect(service.syncing()).toBe(false);
    expect(service.pendingCount()).toBe(0);
  });

  it('does not start a second drain while one is already in progress', async () => {
    let resolveFirst!: (value: string) => void;
    donationDataService.retryOutboxEntry.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    await addOutboxEntry();

    const first = service.drainOutbox();
    // Let the async chain reach the point where retryOutboxEntry has actually been called
    // (appDb.outbox.toArray() is a real Dexie promise, not a synchronous step) before the
    // second call and the resolve.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = service.drainOutbox();
    resolveFirst('synced');
    await Promise.all([first, second]);

    expect(donationDataService.retryOutboxEntry).toHaveBeenCalledTimes(1);
  });
});
