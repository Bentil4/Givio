import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DonationEntry } from './donation-entry';
import { appDb } from '../../../../data/dexie/app-db';
import { DonationService } from '../../../../data/services/donation.service';
import { AuthService } from '../../../../data/services/auth.service';
import { ReceiptService } from '../../../../data/services/receipt.service';
import { EventService } from '../../../../data/services/event.service';
import { OperatorEventContext } from '../operator-event-context';
import type { Event } from '../../../../data/models/event';
import type { Donation } from '../../../../data/models/donation';
import type { OutboxEntry } from '../../../../data/models/outbox-entry';

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
  events?: Event[];
  donations?: Donation[];
  queryEventId?: string | null;
  outbox?: OutboxEntry[];
  createDonation?: ReturnType<typeof vi.fn>;
  receiptService?: {
    downloadReceipt: ReturnType<typeof vi.fn>;
    printReceipt: ReturnType<typeof vi.fn>;
  };
}) {
  const { event = makeEvent(), donations = [], queryEventId = 'e1' } = options;
  const events = options.events ?? (event ? [event] : []);
  await appDb.events.clear();
  await appDb.outbox.clear();
  if (options.outbox) await appDb.outbox.bulkAdd(options.outbox);

  const loadDonationsForEvent = vi.fn().mockResolvedValue(undefined);
  const createDonation = options.createDonation ?? vi.fn();
  const receiptService = options.receiptService ?? {
    downloadReceipt: vi.fn(),
    printReceipt: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [DonationEntry],
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
        provide: AuthService,
        useValue: { currentUser: () => ({ $id: 'op-1', name: 'Efua Mensah' }) },
      },
      { provide: ReceiptService, useValue: receiptService },
      { provide: EventService, useValue: { events: signal(events), loadEvents: vi.fn() } },
      OperatorEventContext,
    ],
  }).compileComponents();

  const ctx = TestBed.inject(OperatorEventContext);
  ctx.pick(queryEventId);
  await ctx.load();

  const fixture = TestBed.createComponent(DonationEntry);
  const component = fixture.componentInstance;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };
  await settle();
  return { fixture, component, ctx, settle, loadDonationsForEvent, createDonation, receiptService };
}

describe('DonationEntry', () => {
  afterEach(async () => {
    await appDb.events.clear();
  });

  it('loads the event and its donations on init', async () => {
    const { component, loadDonationsForEvent } = await setup({});

    expect(component.event()?.id).toBe('e1');
    expect(component.notFound()).toBe(false);
    // The component loads donations only after its outbox (IndexedDB) read resolves, which
    // settle()'s single macrotask doesn't guarantee — wait for the call itself.
    await vi.waitFor(() => expect(loadDonationsForEvent).toHaveBeenCalledWith('e1'));
  });

  it('with no pick and a single active Event, records against that Event (nothing to choose)', async () => {
    const { component } = await setup({ queryEventId: null });
    expect(component.event()?.id).toBe('e1');
    expect(component.needsPick()).toBe(false);
  });

  it('shows not-found when the picked event is not one assigned to this operator', async () => {
    const { component } = await setup({ event: null, queryEventId: 'missing' });
    expect(component.notFound()).toBe(true);
    expect(component.event()).toBeNull();
  });

  it('never swaps an unresolved pick for the only other assigned Event', async () => {
    const { component } = await setup({ queryEventId: 'missing' });
    expect(component.notFound()).toBe(true);
    expect(component.event()).toBeNull();
  });

  describe('event switcher (Story 6.6)', () => {
    const twoEvents = [
      makeEvent({ id: 'e1', name: 'Ama & Kojo' }),
      makeEvent({ id: 'e2', name: 'Asante Funeral', type: 'funeral' }),
    ];

    it('with 2+ active Events and no pick, nothing is pre-selected and Save stays enabled', async () => {
      const { component, fixture } = await setup({ events: twoEvents, queryEventId: null });

      expect(component.event()).toBeNull();
      expect(component.needsPick()).toBe(true);
      expect(component.heading()).toBe('Record a donation');
      const save = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        'app-donation-form button[type="submit"]',
      );
      expect(save?.disabled).toBe(false);
    });

    it('activating Save with no pick asks the context to focus the switcher with "Pick an Event first"', async () => {
      const { component, ctx, fixture } = await setup({ events: twoEvents, queryEventId: null });

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('app-donation-form button[type="submit"]')!
        .click();

      expect(ctx.focusRequest()).toBe(1);
      expect(ctx.pickPrompt()).toContain('Pick an Event first');
      expect(component.phase()).toBe('entry');
    });

    it('names the picked Event in the page-head', async () => {
      const { component, ctx, fixture, settle, loadDonationsForEvent } = await setup({
        events: twoEvents,
        queryEventId: null,
      });

      ctx.pick('e2');
      await settle();

      expect(component.heading()).toBe('Asante Funeral');
      expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain(
        'Asante Funeral',
      );
      await vi.waitFor(() => expect(loadDonationsForEvent).toHaveBeenCalledWith('e2'));
    });

    it('switching Events mid-confirm returns to entry instead of carrying the draft across', async () => {
      const { component, ctx, settle } = await setup({ events: twoEvents, queryEventId: 'e1' });
      component.onSubmitted({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });
      expect(component.phase()).toBe('confirming');

      ctx.pick('e2');
      await settle();

      expect(component.phase()).toBe('entry');
      expect(component.draft()).toBeNull();
    });

    it('confirm() rejects a draft made for a different Event than the one now active, never re-homing it', async () => {
      const createDonation = vi.fn();
      const { component } = await setup({ events: twoEvents, queryEventId: 'e2', createDonation });
      component.draft.set({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });

      await component.confirm();

      expect(createDonation).not.toHaveBeenCalled();
      expect(component.saveError()).toContain('different Event');
    });

    it('only shows donations belonging to the active Event', async () => {
      const { component } = await setup({
        events: twoEvents,
        queryEventId: 'e2',
        donations: [
          makeDonation({ id: 'a', eventId: 'e1' }),
          makeDonation({ id: 'b', eventId: 'e2' }),
        ],
      });

      expect(component.donations().map((d) => d.id)).toEqual(['b']);
    });
  });

  it('allows recording against an active event', async () => {
    const { component } = await setup({ event: makeEvent({ status: 'active' }) });
    expect(component.canRecord()).toBe(true);
    expect(component.blocked()).toBeNull();
  });

  it('blocks a paused event with a reason', async () => {
    const { component } = await setup({ event: makeEvent({ status: 'paused' }) });
    expect(component.canRecord()).toBe(false);
    expect(component.blocked()).toContain('paused');
    expect(component.blocked()).toContain("Ask your company's organizer to resume it.");
    expect(component.blocked()).not.toContain('Admin');
  });

  it('only counts/totals donations recorded by the current operator', async () => {
    const { component } = await setup({
      donations: [
        makeDonation({ id: 'mine', recordedBy: 'op-1', amountMinor: 5000 }),
        makeDonation({ id: 'not-mine', recordedBy: 'op-2', amountMinor: 9999 }),
      ],
    });

    expect(component.myCount()).toBe(1);
    expect(component.myEntries().map((d) => d.id)).toEqual(['mine']);
  });

  it('splits server-rejected creates out of pending, keeping their reason for the queue', async () => {
    const entry = (entityId: string, overrides: Partial<OutboxEntry> = {}): OutboxEntry => ({
      entityType: 'donation',
      entityId,
      op: 'create',
      payload: makeDonation({ id: entityId, syncStatus: 'pending' }),
      status: 'pending',
      retries: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    });
    const { component } = await setup({
      outbox: [
        entry('queued'),
        entry('refused', {
          status: 'failed',
          lastError: 'This donation was recorded for a different event than the one it was sent to',
        }),
      ],
    });

    await vi.waitFor(() => expect(component.rejected()).toHaveLength(1));
    expect(component.pending()).toHaveLength(1);
    expect(component.rejected()[0].rejectionReason).toContain('different event');
    expect(component.rejected()[0].receiptNumber).toBe('P-1');
  });

  it('confirm() saves via DonationService and moves to the saved phase', async () => {
    const createDonation = vi.fn().mockResolvedValueOnce(makeDonation());
    const { component } = await setup({ createDonation });

    component.draft.set({
      localId: 'l1',
      eventId: 'e1',
      donorName: 'Ama',
      amountMinor: 5000,
      donationType: 'cash',
    });
    await component.confirm();

    expect(createDonation).toHaveBeenCalled();
    expect(component.phase()).toBe('saved');
    expect(component.saveError()).toBeNull();
  });

  it('confirm() surfaces a ServiceError instead of silently succeeding', async () => {
    const { ServiceError } = await import('../../../../core/services/service-error');
    const createDonation = vi
      .fn()
      .mockRejectedValueOnce(
        new ServiceError('Cannot record a donation against a paused or closed event'),
      );
    const { component } = await setup({ createDonation });

    component.onSubmitted({
      localId: 'l1',
      eventId: 'e1',
      donorName: 'Ama',
      amountMinor: 5000,
      donationType: 'cash',
    });
    await component.confirm();

    expect(component.phase()).toBe('confirming');
    expect(component.saveError()).toContain('paused or closed');
  });

  describe('receipts (Story 3.6)', () => {
    it('downloadReceipt delegates to ReceiptService with the last-saved donation, the event, and the operator name', async () => {
      const createDonation = vi
        .fn()
        .mockResolvedValueOnce(makeDonation({ receiptNumber: 'WEDE1-1' }));
      const receiptService = { downloadReceipt: vi.fn(), printReceipt: vi.fn() };
      const { component } = await setup({ createDonation, receiptService });
      component.draft.set({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });
      await component.confirm();

      component.downloadReceipt();

      expect(receiptService.downloadReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ receiptNumber: 'WEDE1-1' }),
        expect.objectContaining({ id: 'e1' }),
        'Efua Mensah',
      );
    });

    it('printReceipt delegates to ReceiptService the same way', async () => {
      const createDonation = vi.fn().mockResolvedValueOnce(makeDonation());
      const receiptService = { downloadReceipt: vi.fn(), printReceipt: vi.fn() };
      const { component } = await setup({ createDonation, receiptService });
      component.draft.set({
        localId: 'l1',
        eventId: 'e1',
        donorName: 'Ama',
        amountMinor: 5000,
        donationType: 'cash',
      });
      await component.confirm();

      component.printReceipt();

      expect(receiptService.printReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'd1' }),
        expect.objectContaining({ id: 'e1' }),
        'Efua Mensah',
      );
    });

    it('does nothing before a donation has been saved', async () => {
      const receiptService = { downloadReceipt: vi.fn(), printReceipt: vi.fn() };
      const { component } = await setup({ receiptService });

      component.downloadReceipt();
      component.printReceipt();

      expect(receiptService.downloadReceipt).not.toHaveBeenCalled();
      expect(receiptService.printReceipt).not.toHaveBeenCalled();
    });
  });
});
