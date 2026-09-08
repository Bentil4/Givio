import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { MobileEntry } from './mobile-entry';
import { appDb } from '../../../../data/dexie/app-db';
import { DonationService } from '../../../../data/services/donation.service';
import { ServiceError } from '../../../../data/services/service-error';
import type { Event } from '../../../../data/models/event';
import type { Donation } from '../../../../data/models/donation';

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Ama & Kojo',
  type: 'wedding',
  date: '2026-06-01',
  hostName: 'The Mensah Family',
  status: 'active',
  assignedUserIds: ['op-1'],
  createdBy: 'admin-1',
  nextReceiptSeq: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeDonation = (overrides: Partial<Donation> = {}): Donation => ({
  id: 'd1',
  eventId: 'e1',
  receiptNumber: 'P-1',
  donorName: 'Ama',
  amountMinor: 5000,
  donationType: 'cash',
  recordedBy: 'op-1',
  recordedAt: '2026-01-01T00:00:00.000Z',
  syncStatus: 'synced',
  ...overrides,
});

async function setup(options: {
  event?: Event | null;
  donations?: Donation[];
  queryEventId?: string | null;
  createDonation?: ReturnType<typeof vi.fn>;
  outboxEntries?: Parameters<typeof appDb.outbox.add>[0][];
}) {
  const { event = makeEvent(), donations = [], queryEventId = 'e1' } = options;
  await appDb.events.clear();
  await appDb.outbox.clear();
  if (event) {
    await appDb.events.put(event);
  }
  for (const entry of options.outboxEntries ?? []) {
    await appDb.outbox.add(entry);
  }

  const loadDonationsForEvent = vi.fn().mockResolvedValue(undefined);
  const createDonation = options.createDonation ?? vi.fn();

  await TestBed.configureTestingModule({
    imports: [MobileEntry],
    providers: [
      provideRouter([]),
      {
        provide: DonationService,
        useValue: {
          donations: signal(donations).asReadonly(),
          loadDonationsForEvent,
          createDonation,
        },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: { get: () => queryEventId } } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(MobileEntry);
  const component = fixture.componentInstance;
  await component.ngOnInit();
  fixture.detectChanges();
  return { fixture, component, loadDonationsForEvent, createDonation };
}

describe('MobileEntry', () => {
  afterEach(async () => {
    await appDb.events.clear();
    await appDb.outbox.clear();
  });

  it('loads the event and its donations on init', async () => {
    const { component, loadDonationsForEvent } = await setup({});

    expect(component.event()?.id).toBe('e1');
    expect(component.notFound()).toBe(false);
    expect(loadDonationsForEvent).toHaveBeenCalledWith('e1');
  });

  it('shows not-found when there is no event query param', async () => {
    const { component } = await setup({ queryEventId: null });
    expect(component.notFound()).toBe(true);
    expect(component.eventName()).toBe('Event not found');
  });

  it('shows not-found when the event does not exist locally', async () => {
    const { component } = await setup({ event: null, queryEventId: 'missing' });
    expect(component.notFound()).toBe(true);
  });

  it('derives the header total from DonationService.donations', async () => {
    const { component } = await setup({
      donations: [makeDonation({ amountMinor: 5000 }), makeDonation({ id: 'd2', amountMinor: 2500 })],
    });
    expect(component.eventTotalMinor()).toBe(7500);
  });

  it('counts this event\'s pending donation-create outbox entries', async () => {
    const { component } = await setup({
      outboxEntries: [
        {
          entityType: 'donation',
          entityId: 'd1',
          op: 'create',
          payload: makeDonation({ eventId: 'e1' }),
          status: 'pending',
          retries: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          entityType: 'donation',
          entityId: 'd2',
          op: 'create',
          payload: makeDonation({ id: 'd2', eventId: 'other-event' }),
          status: 'pending',
          retries: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(component.pendingCount()).toBe(1);
  });

  it('save() rejects until name and amount are both valid', async () => {
    const { component } = await setup({});
    expect(component.canSave()).toBe(false);

    component.setName('Ama');
    expect(component.canSave()).toBe(false);

    component.press('5'); component.press('0');
    expect(component.canSave()).toBe(true);
  });

  it('save() calls DonationService.createDonation and resets the form on success', async () => {
    const createDonation = vi.fn().mockResolvedValueOnce(makeDonation());
    const { component } = await setup({ createDonation });

    component.setName('Ama');
    component.press('5'); component.press('0');
    await component.save();

    expect(createDonation).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'e1', donorName: 'Ama', amountMinor: 5000 }),
    );
    expect(component.donorName()).toBe('');
    expect(component.amountText()).toBe('');
    expect(component.saveError()).toBeNull();
  });

  it('save() surfaces a ServiceError instead of silently succeeding', async () => {
    const createDonation = vi.fn().mockRejectedValueOnce(
      new ServiceError('Cannot record a donation against a paused or closed event'),
    );
    const { component } = await setup({ createDonation });

    component.setName('Ama');
    component.press('5'); component.press('0');
    await component.save();

    expect(component.saveError()).toContain('paused or closed');
    // A failed save must not clear what the collector typed.
    expect(component.donorName()).toBe('Ama');
  });
});
