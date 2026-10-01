import { TestBed } from '@angular/core/testing';
import { DATABASES } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { OrganizerEventDataService } from './organizer-event-data.service';
import { SettlementDataService } from './settlement-data.service';
import type { Event } from '../models/event';

const donationRow = (id: string, eventId: string) => ({
  $id: id,
  eventId,
  receiptNumber: `R-${id}`,
  donorName: 'Ama',
  donorPhone: '+233200000000',
  amountMinor: 1500,
  donationType: 'cash',
  recordedBy: 'op-1',
  recordedAt: '2026-11-10T10:00:00.000Z',
  syncStatus: null,
  deletedAt: null,
});

describe('SettlementDataService', () => {
  let listRows: ReturnType<typeof vi.fn>;
  let listTenantEvents: ReturnType<typeof vi.fn>;
  let service: SettlementDataService;

  beforeEach(() => {
    listRows = vi.fn();
    listTenantEvents = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: DATABASES, useValue: { listRows } },
        { provide: OrganizerEventDataService, useValue: { listTenantEvents } },
      ],
    });
    service = TestBed.inject(SettlementDataService);
  });

  const events = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: `e${i}` }) as Event);

  it("reads only the tenant's Events and the donations on them", async () => {
    listTenantEvents.mockResolvedValue(events(2));
    listRows.mockResolvedValue({ rows: [donationRow('d1', 'e0')] });

    const data = await service.loadTenantSettlementData('t1');

    expect(listTenantEvents).toHaveBeenCalledWith('t1');
    expect(data.events).toHaveLength(2);
    expect(data.donations).toEqual([
      expect.objectContaining({ id: 'd1', eventId: 'e0', amountMinor: 1500, syncStatus: 'synced' }),
    ]);
    expect(data.donations[0]).not.toHaveProperty('donorPhone');
    const queries: string[] = listRows.mock.calls[0][0].queries;
    expect(queries.some((q) => q.includes('"eventId"') && q.includes('e1'))).toBe(true);
  });

  it('skips the donation read entirely when the tenant has no Events', async () => {
    listTenantEvents.mockResolvedValue([]);

    expect(await service.loadTenantSettlementData('t1')).toEqual({ events: [], donations: [] });
    expect(listRows).not.toHaveBeenCalled();
  });

  it('pages through every donation and splits Event ids into batches of 100', async () => {
    listTenantEvents.mockResolvedValue(events(150));
    const fullPage = Array.from({ length: 100 }, (_, i) => donationRow(`p${i}`, 'e0'));
    listRows
      .mockResolvedValueOnce({ rows: fullPage })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [donationRow('last', 'e0')] });

    const data = await service.loadTenantSettlementData('t1');

    expect(data.donations).toHaveLength(101);
    expect(listRows).toHaveBeenCalledTimes(3);
  });

  it('reports a failed donation read as a ServiceError', async () => {
    listTenantEvents.mockResolvedValue(events(1));
    listRows.mockRejectedValue(new Error('offline'));

    await expect(service.loadTenantSettlementData('t1')).rejects.toBeInstanceOf(ServiceError);
  });
});
