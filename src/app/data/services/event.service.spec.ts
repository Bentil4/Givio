import { TestBed } from '@angular/core/testing';
import { EventService } from './event.service';
import { EventDataService } from './event-data.service';
import type { Event } from '../models/event';

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Original',
  type: 'wedding',
  date: '2026-01-01',
  hostName: 'Host',
  status: 'active',
  assignedUserIds: [],
  createdBy: 'admin-1',
  nextReceiptSeq: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('EventService', () => {
  let service: EventService;
  let eventDataService: {
    createEvent: ReturnType<typeof vi.fn>;
    updateEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    eventDataService = { createEvent: vi.fn(), updateEvent: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: EventDataService, useValue: eventDataService }],
    });
    service = TestBed.inject(EventService);
  });

  it('createEvent delegates to EventDataService and appends to the events signal', async () => {
    const created = makeEvent();
    eventDataService.createEvent.mockResolvedValueOnce(created);

    const result = await service.createEvent({
      name: 'Original',
      type: 'wedding',
      date: '2026-01-01',
      hostName: 'Host',
    });

    expect(result).toEqual(created);
    expect(service.events()).toEqual([created]);
  });

  it('updateEvent delegates to EventDataService and replaces the event by id', async () => {
    const original = makeEvent();
    eventDataService.createEvent.mockResolvedValueOnce(original);
    await service.createEvent({ name: 'Original', type: 'wedding', date: '2026-01-01', hostName: 'Host' });

    const updated = makeEvent({ name: 'Renamed' });
    eventDataService.updateEvent.mockResolvedValueOnce(updated);

    const result = await service.updateEvent('e1', { name: 'Renamed' });

    expect(result).toEqual(updated);
    expect(service.events()).toEqual([updated]);
    expect(eventDataService.updateEvent).toHaveBeenCalledWith('e1', { name: 'Renamed' });
  });
});
