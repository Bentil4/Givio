import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OperatorDashboard } from './operator-dashboard';
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
    imports: [OperatorDashboard],
    providers: [
      provideRouter([]),
      { provide: EventService, useValue: { events: signal(events).asReadonly(), loadEvents } },
      { provide: AuthService, useValue: { currentUser: () => ({ $id: userId }) } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(OperatorDashboard);
  const component = fixture.componentInstance;
  await component.ngOnInit();
  fixture.detectChanges();
  return { fixture, component, loadEvents };
}

describe('OperatorDashboard', () => {
  it('counts only events assigned to the current operator', async () => {
    const { component } = await setup([
      makeEvent({ id: 'mine', assignedUserIds: ['op-1'] }),
      makeEvent({ id: 'not-mine', assignedUserIds: ['op-2'] }),
    ]);

    expect(component.assignedEvents().map((e) => e.id)).toEqual(['mine']);
  });

  it('calls EventService.loadEvents on init', async () => {
    const { loadEvents } = await setup([]);
    expect(loadEvents).toHaveBeenCalled();
  });

  it('previews at most 3 assigned events', async () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent({ id: `e${i}`, assignedUserIds: ['op-1'] }),
    );
    const { component } = await setup(events);

    expect(component.previewEvents()).toHaveLength(3);
  });

  it('surfaces a load error instead of throwing', async () => {
    const loadEvents = vi.fn().mockRejectedValue(new Error('offline'));
    await TestBed.configureTestingModule({
      imports: [OperatorDashboard],
      providers: [
        provideRouter([]),
        { provide: EventService, useValue: { events: signal([]).asReadonly(), loadEvents } },
        { provide: AuthService, useValue: { currentUser: () => ({ $id: 'op-1' }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OperatorDashboard);
    const component = fixture.componentInstance;
    await component.ngOnInit();

    expect(component.loadError()).toBe('Failed to load events');
  });
});
