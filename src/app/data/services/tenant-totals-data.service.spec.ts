import { TestBed } from '@angular/core/testing';
import { Query } from 'appwrite';
import type { Mock } from 'vitest';
import { TenantTotalsDataService, type TenantChangeListeners } from './tenant-totals-data.service';
import { DATABASES, REALTIME } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { environment } from '../../../environments/environment';

const donationRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  $id: id,
  amountMinor: 1000,
  deletedAt: null,
  syncStatus: 'synced',
  ...overrides,
});

describe('TenantTotalsDataService', () => {
  let service: TenantTotalsDataService;
  let listRows: ReturnType<typeof vi.fn>;
  let subscribe: ReturnType<typeof vi.fn>;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listRows = vi.fn();
    unsubscribe = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue({ unsubscribe });
    TestBed.configureTestingModule({
      providers: [
        { provide: DATABASES, useValue: { listRows } },
        { provide: REALTIME, useValue: { subscribe } },
      ],
    });
    service = TestBed.inject(TenantTotalsDataService);
  });

  describe('loadEventFigures', () => {
    it('totals one Event with the shared exclusion rule and counts the donors it counted', async () => {
      listRows.mockResolvedValue({
        rows: [
          donationRow('d1', { amountMinor: 50000 }),
          donationRow('d2', { amountMinor: 2550 }),
          donationRow('d3', { amountMinor: 99999, deletedAt: '2026-10-01T00:00:00.000Z' }),
          donationRow('d4', { amountMinor: 99999, syncStatus: 'conflict' }),
          donationRow('d5', { amountMinor: null }),
        ],
      });

      const figures = await service.loadEventFigures('e1');

      expect(figures).toEqual({ totalMinor: 52550, donorCount: 3 });
    });

    it('reads only that Event, only the counted columns, a page at a time', async () => {
      listRows.mockResolvedValue({ rows: [] });

      await service.loadEventFigures('e1');

      const { tableId, queries } = listRows.mock.calls[0][0];
      expect(tableId).toBe(environment.donationsCollectionId);
      expect(queries).toContain(Query.equal('eventId', ['e1']));
      expect(queries).toContain(Query.select(['$id', 'amountMinor', 'deletedAt', 'syncStatus']));
      expect(queries).toContain(Query.limit(100));
    });

    it('follows the cursor until a short page', async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => donationRow(`d${i}`));
      listRows
        .mockResolvedValueOnce({ rows: fullPage })
        .mockResolvedValueOnce({ rows: [donationRow('last', { amountMinor: 1 })] });

      const figures = await service.loadEventFigures('e1');

      expect(listRows).toHaveBeenCalledTimes(2);
      expect(listRows.mock.calls[1][0].queries).toContain(Query.cursorAfter('d99'));
      expect(figures).toEqual({ totalMinor: 100001, donorCount: 101 });
    });

    it('is a real GH₵0.00 for an Event with no donations', async () => {
      listRows.mockResolvedValue({ rows: [] });

      expect(await service.loadEventFigures('e1')).toEqual({ totalMinor: 0, donorCount: 0 });
    });

    it('rethrows a failed read as a ServiceError', async () => {
      listRows.mockRejectedValue(new Error('network'));

      await expect(service.loadEventFigures('e1')).rejects.toBeInstanceOf(ServiceError);
    });
  });

  describe('subscribeToTenantChanges', () => {
    let listeners: {
      onDonationChanged: Mock<TenantChangeListeners['onDonationChanged']>;
      onEventChanged: Mock<TenantChangeListeners['onEventChanged']>;
    };

    const push = (subscriptionIndex: number, payload: unknown) =>
      subscribe.mock.calls[subscriptionIndex][1]({ payload });

    beforeEach(() => {
      listeners = {
        onDonationChanged: vi.fn<TenantChangeListeners['onDonationChanged']>(),
        onEventChanged: vi.fn<TenantChangeListeners['onEventChanged']>(),
      };
    });

    it('subscribes to the donations and events tables', async () => {
      await service.subscribeToTenantChanges(listeners);

      const channels = subscribe.mock.calls.map(([channel]) => channel.toString());
      expect(channels[0]).toContain(environment.donationsCollectionId);
      expect(channels[1]).toContain(environment.eventsCollectionId);
    });

    it('reports which Event a pushed donation belongs to', async () => {
      await service.subscribeToTenantChanges(listeners);

      push(0, { $id: 'd1', eventId: 'e2', amountMinor: 100 });

      expect(listeners.onDonationChanged).toHaveBeenCalledWith('e2');
    });

    it('reports the shown fields of a pushed Event row', async () => {
      await service.subscribeToTenantChanges(listeners);

      push(1, { $id: 'e1', name: 'Odoi Funeral', status: 'paused', tenantId: 'tenant-a' });

      expect(listeners.onEventChanged).toHaveBeenCalledWith({
        id: 'e1',
        name: 'Odoi Funeral',
        status: 'paused',
      });
    });

    it('ignores pushes it cannot read', async () => {
      await service.subscribeToTenantChanges(listeners);

      push(0, { $id: 'd1' });
      push(1, { $id: 'e1', name: 'Odoi Funeral', status: 'archived' });
      push(1, null);

      expect(listeners.onDonationChanged).not.toHaveBeenCalled();
      expect(listeners.onEventChanged).not.toHaveBeenCalled();
    });

    it('closes both subscriptions on cleanup', async () => {
      const stop = await service.subscribeToTenantChanges(listeners);

      stop();

      expect(unsubscribe).toHaveBeenCalledTimes(2);
    });
  });
});
