import { TestBed } from '@angular/core/testing';
import { EventService } from './event.service';
import { EventDataService } from './event-data.service';
import { makeEvent } from './donation-data-test-fixtures';

describe('EventService', () => {
  let service: EventService;
  let eventDataService: { listEvents: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    eventDataService = { listEvents: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: EventDataService, useValue: eventDataService }],
    });
    service = TestBed.inject(EventService);
  });

  it('loadEvents fills the events signal from EventDataService', async () => {
    const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })];
    eventDataService.listEvents.mockResolvedValueOnce(events);

    await service.loadEvents();

    expect(service.events()).toEqual(events);
  });
});
