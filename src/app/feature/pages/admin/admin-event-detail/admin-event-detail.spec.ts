import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AdminEventDetail } from './admin-event-detail';
import { appDb } from '../../../../data/dexie/app-db';
import { EventService } from '../../../../data/services/event.service';
import { UserService } from '../../../../data/services/user.service';
import { ServiceError } from '../../../../data/services/service-error';
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

async function setup(options: {
  event?: Event | null;
  regenerateAccessCode?: ReturnType<typeof vi.fn>;
}) {
  const { event = makeEvent() } = options;
  await appDb.events.clear();
  if (event) {
    await appDb.events.put(event);
  }

  const regenerateAccessCode = options.regenerateAccessCode ?? vi.fn();

  await TestBed.configureTestingModule({
    imports: [AdminEventDetail],
    providers: [
      provideRouter([]),
      { provide: EventService, useValue: { regenerateAccessCode } },
      { provide: UserService, useValue: { listUsers: vi.fn().mockResolvedValue([]) } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => event?.id ?? 'missing' } } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AdminEventDetail);
  const component = fixture.componentInstance;
  await component.ngOnInit();
  fixture.detectChanges();
  return { fixture, component, regenerateAccessCode };
}

describe('AdminEventDetail', () => {
  afterEach(async () => {
    await appDb.events.clear();
  });

  it('has no code and no button to make one missing — hasCode is false for a freshly-created event', async () => {
    const { component } = await setup({ event: makeEvent({ accessCode: undefined }) });
    expect(component.hasCode()).toBe(false);
  });

  it('"generate" calls EventService.regenerateAccessCode and stores the returned code', async () => {
    const regenerateAccessCode = vi.fn().mockResolvedValueOnce(makeEvent({ accessCode: 'ABCD2345' }));
    const { component } = await setup({ event: makeEvent({ accessCode: undefined }), regenerateAccessCode });

    component.ask('generate');
    await component.confirm();

    expect(regenerateAccessCode).toHaveBeenCalledWith('e1');
    expect(component.event()?.accessCode).toBe('ABCD2345');
    expect(component.hasCode()).toBe(true);
    expect(component.confirming()).toBeNull();
  });

  it('"regenerate" calls the same EventService method for an event that already has a code', async () => {
    const regenerateAccessCode = vi.fn().mockResolvedValueOnce(makeEvent({ accessCode: 'NEWCODE1' }));
    const { component } = await setup({ event: makeEvent({ accessCode: 'OLDCODE1' }), regenerateAccessCode });

    component.ask('regenerate');
    await component.confirm();

    expect(regenerateAccessCode).toHaveBeenCalledWith('e1');
    expect(component.event()?.accessCode).toBe('NEWCODE1');
  });

  it('surfaces a ServiceError instead of silently succeeding', async () => {
    const regenerateAccessCode = vi.fn().mockRejectedValueOnce(new ServiceError('Failed to generate a unique code, try again'));
    const { component } = await setup({ event: makeEvent({ accessCode: undefined }), regenerateAccessCode });

    component.ask('generate');
    await component.confirm();

    expect(component.actionError()).toContain('unique code');
    // Stays open so the Admin can retry rather than losing the dialog on failure.
    expect(component.confirming()).toBe('generate');
  });

  it('pause/resume/close remain an honest "not available yet" stub', async () => {
    const { component } = await setup({});
    component.ask('pause');
    await component.confirm();
    expect(component.actionError()).toContain('available yet');
  });
});
