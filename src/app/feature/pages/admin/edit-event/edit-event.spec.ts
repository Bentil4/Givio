import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { EditEvent } from './edit-event';
import { appDb } from '../../../../data/dexie/app-db';
import { EventService } from '../../../../data/services/event.service';
import type { Event } from '../../../../data/models/event';

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Original Name',
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

async function setup(event: Event | null, eventService: { updateEvent: ReturnType<typeof vi.fn> }) {
  if (event) {
    await appDb.events.put(event);
  }

  await TestBed.configureTestingModule({
    imports: [EditEvent],
    providers: [
      provideRouter([]),
      { provide: EventService, useValue: eventService },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => event?.id ?? 'missing' } } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(EditEvent);
  const component = fixture.componentInstance;
  // ngOnInit awaits a real (fake-indexeddb) Dexie read, which zoneless whenStable() doesn't
  // reliably flush — invoke it directly instead of via fixture.detectChanges().
  await component.ngOnInit();
  fixture.detectChanges();
  return { fixture, component, router: TestBed.inject(Router) };
}

describe('EditEvent', () => {
  afterEach(async () => {
    await appDb.events.clear();
  });

  it('loads the event and prefills the form, excluding type', async () => {
    const { component } = await setup(makeEvent(), { updateEvent: vi.fn() });

    expect(component.event()?.id).toBe('e1');
    expect(component.form.value).toEqual({
      name: 'Original Name',
      date: '2026-06-01',
      hostName: 'The Mensah Family',
      venue: '',
      description: '',
      notes: '',
    });
  });

  it('shows not-found when the event does not exist', async () => {
    const { component } = await setup(null, { updateEvent: vi.fn() });

    expect(component.notFound()).toBe(true);
  });

  it('disables the form for a closed event', async () => {
    const { component } = await setup(makeEvent({ status: 'closed' }), { updateEvent: vi.fn() });

    expect(component.form.disabled).toBe(true);
  });

  it('calls EventService.updateEvent with the patch and navigates on success', async () => {
    const eventService = { updateEvent: vi.fn().mockResolvedValueOnce(makeEvent({ name: 'Renamed' })) };
    const { component, router } = await setup(makeEvent(), eventService);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.form.patchValue({ name: 'Renamed' });
    await component.onSubmit();

    expect(eventService.updateEvent).toHaveBeenCalledWith('e1', {
      name: 'Renamed',
      date: '2026-06-01',
      hostName: 'The Mensah Family',
      venue: undefined,
      description: undefined,
      notes: undefined,
    });
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('refuses to submit against a closed event even if called directly', async () => {
    const eventService = { updateEvent: vi.fn() };
    const { component } = await setup(makeEvent({ status: 'closed' }), eventService);

    await component.onSubmit();

    expect(eventService.updateEvent).not.toHaveBeenCalled();
  });
});
