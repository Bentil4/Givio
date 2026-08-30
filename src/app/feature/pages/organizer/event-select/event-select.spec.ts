import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { EventSelect } from './event-select';
import { EventService } from '../../../../data/services/event.service';
import { AuthService } from '../../../../data/services/auth.service';
import type { Event } from '../../../../data/models/event';

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Ama & Kojo',
  type: 'wedding',
  date: '2026-06-01',
  hostName: 'The Mensah Family',
  status: 'active',
  assignedUserIds: [],
  createdBy: 'admin-1',
  nextReceiptSeq: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

async function setup(events: Event[], userId = 'op-1') {
  const loadEvents = vi.fn().mockResolvedValue(undefined);
  await TestBed.configureTestingModule({
    imports: [EventSelect],
    providers: [
      provideRouter([]),
      { provide: EventService, useValue: { events: signal(events).asReadonly(), loadEvents } },
      { provide: AuthService, useValue: { currentUser: () => ({ $id: userId }) } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(EventSelect);
  const component = fixture.componentInstance;
  await component.ngOnInit();
  fixture.detectChanges();
  return { fixture, component, router: TestBed.inject(Router), loadEvents };
}

describe('EventSelect', () => {
  it('only shows events assigned to the current operator', async () => {
    const { component } = await setup([
      makeEvent({ id: 'mine', assignedUserIds: ['op-1'] }),
      makeEvent({ id: 'not-mine', assignedUserIds: ['op-2'] }),
    ]);

    expect(component.events().map((e) => e.id)).toEqual(['mine']);
  });

  it('calls EventService.loadEvents on init', async () => {
    const { loadEvents } = await setup([]);
    expect(loadEvents).toHaveBeenCalled();
  });

  it('navigates to the entry screen for an active assigned event', async () => {
    const { component, router } = await setup([makeEvent({ id: 'e1', assignedUserIds: ['op-1'], status: 'active' })]);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.select(component.events()[0]);

    expect(router.navigate).toHaveBeenCalledWith(['/organizer/entry'], { queryParams: { event: 'e1' } });
  });

  it('blocks a paused event and surfaces a reason instead of navigating', async () => {
    const { component, router } = await setup([makeEvent({ id: 'e1', assignedUserIds: ['op-1'], status: 'paused' })]);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.select(component.events()[0]);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.notice()).toContain('paused');
  });

  it('reports "no events" heading when none are assigned', async () => {
    const { component } = await setup([]);
    expect(component.heading()).toBe('No events assigned yet');
  });

  it('reports a singular heading for exactly one assigned event', async () => {
    const { component } = await setup([makeEvent({ assignedUserIds: ['op-1'] })]);
    expect(component.heading()).toBe("You're assigned to 1 event");
  });

  it('reports a plural heading for more than one assigned event', async () => {
    const { component } = await setup([
      makeEvent({ id: 'e1', assignedUserIds: ['op-1'] }),
      makeEvent({ id: 'e2', assignedUserIds: ['op-1'] }),
    ]);
    expect(component.heading()).toBe("You're assigned to 2 events");
  });
});
