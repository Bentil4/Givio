import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { DonationEntry } from './donation-entry';
import { appDb } from '../../../../data/dexie/app-db';
import { DonationService } from '../../../../data/services/donation.service';
import { AuthService } from '../../../../data/services/auth.service';
import { ReceiptService } from '../../../../data/services/receipt.service';
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
  receiptService?: { downloadReceipt: ReturnType<typeof vi.fn>; printReceipt: ReturnType<typeof vi.fn> };
}) {
  const { event = makeEvent(), donations = [], queryEventId = 'e1' } = options;
  await appDb.events.clear();
  if (event) {
    await appDb.events.put(event);
  }

  const loadDonationsForEvent = vi.fn().mockResolvedValue(undefined);
  const createDonation = options.createDonation ?? vi.fn();
  const receiptService = options.receiptService ?? { downloadReceipt: vi.fn(), printReceipt: vi.fn() };

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
      { provide: AuthService, useValue: { currentUser: () => ({ $id: 'op-1', name: 'Efua Mensah' }) } },
      { provide: ReceiptService, useValue: receiptService },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: { get: () => queryEventId } } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(DonationEntry);
  const component = fixture.componentInstance;
  await component.ngOnInit();
  fixture.detectChanges();
  return { fixture, component, loadDonationsForEvent, createDonation, receiptService };
}

describe('DonationEntry', () => {
  afterEach(async () => {
    await appDb.events.clear();
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
  });

  it('shows not-found when the event does not exist locally', async () => {
    const { component } = await setup({ event: null, queryEventId: 'missing' });
    expect(component.notFound()).toBe(true);
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
    const { ServiceError } = await import('../../../../data/services/service-error');
    const createDonation = vi.fn().mockRejectedValueOnce(new ServiceError('Cannot record a donation against a paused or closed event'));
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
      const createDonation = vi.fn().mockResolvedValueOnce(makeDonation({ receiptNumber: 'WEDE1-1' }));
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
