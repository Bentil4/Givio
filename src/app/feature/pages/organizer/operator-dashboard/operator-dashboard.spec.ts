import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { OperatorDashboard } from './operator-dashboard';
import { EventService } from '../../../../data/services/event.service';
import { AuthService } from '../../../../data/services/auth.service';
import { TenantService } from '../../../../data/services/tenant.service';
import type { Event } from '../../../../data/models/event';
import type { SidebarBrand } from '../../../../data/models/user.model';
import { OperatorEventContext } from '../operator-event-context';
import type { Donation } from '../../../../data/models/donation';
import { makeDonation } from '../../../../data/models/donation-test-fixtures';
import { DonationDataService } from '../../../../data/services/donation-data.service';
import { DonationService } from '../../../../data/services/donation.service';
import { SyncEngineService } from '../../../../data/services/sync-engine.service';
import { createFakeCharts } from '../../../../../testing/fake-chart';

// The donation reads are plain promises, not Angular pending tasks, so whenStable can't wait on them.
const settle = () => new Promise((resolve) => setTimeout(resolve));

const PERIOD_KEY = 'givio.dashboard-period.operator.op-1';

interface DonationStubs {
  donations?: Donation[];
  listDonationsForEvent?: ReturnType<typeof vi.fn>;
  pendingCount?: number;
}

function donationProviders(stubs: DonationStubs = {}) {
  const listDonationsForEvent =
    stubs.listDonationsForEvent ??
    vi.fn(async (eventId: string) => (stubs.donations ?? []).filter((d) => d.eventId === eventId));
  return {
    listDonationsForEvent,
    providers: [
      { provide: DonationDataService, useValue: { listDonationsForEvent } },
      {
        provide: DonationService,
        useValue: { subscribeToChanges: vi.fn().mockResolvedValue(vi.fn()) },
      },
      { provide: SyncEngineService, useValue: { pendingCount: signal(stubs.pendingCount ?? 0) } },
      createFakeCharts().provider,
    ],
  };
}

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

async function setup(
  events: Event[],
  userId = 'op-1',
  brand: SidebarBrand | null = null,
  stubs: DonationStubs = {},
) {
  const loadEvents = vi.fn().mockResolvedValue(undefined);
  const donationStubs = donationProviders(stubs);
  await TestBed.configureTestingModule({
    imports: [OperatorDashboard],
    providers: [
      provideRouter([]),
      { provide: EventService, useValue: { events: signal(events).asReadonly(), loadEvents } },
      { provide: AuthService, useValue: { currentUser: () => ({ $id: userId }) } },
      { provide: TenantService, useValue: { companyBrand: signal(brand) } },
      OperatorEventContext,
      ...donationStubs.providers,
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(OperatorDashboard);
  const component = fixture.componentInstance;
  await component.ngOnInit();
  fixture.detectChanges();
  await settle();
  fixture.detectChanges();
  return {
    fixture,
    component,
    loadEvents,
    listDonationsForEvent: donationStubs.listDonationsForEvent,
    ctx: TestBed.inject(OperatorEventContext),
  };
}

describe('OperatorDashboard', () => {
  beforeEach(() => localStorage.clear());
  it('counts only events assigned to the current operator', async () => {
    const { component } = await setup([
      makeEvent({ id: 'mine', assignedUserIds: ['op-1'] }),
      makeEvent({ id: 'not-mine', assignedUserIds: ['op-2'] }),
    ]);

    expect(component.assignedEvents().map((e) => e.id)).toEqual(['mine']);
  });

  it("names the Operator's company above the page heading", async () => {
    const { fixture } = await setup([], 'op-1', { name: 'Adom Funerals' });
    const company = (fixture.nativeElement as HTMLElement).querySelector('.page-head-company');

    expect(company?.textContent).toContain('Working for Adom Funerals');
  });

  it('shows no company line when the company is unknown', async () => {
    const { fixture } = await setup([]);

    expect((fixture.nativeElement as HTMLElement).querySelector('.page-head-company')).toBeNull();
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
        OperatorEventContext,
        ...donationProviders().providers,
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OperatorDashboard);
    const component = fixture.componentInstance;
    await component.ngOnInit();

    expect(component.loadError()).toBe('Failed to load events');
  });

  describe('event switcher (Story 6.6)', () => {
    const two = [
      makeEvent({ id: 'e1', name: 'Ama & Kojo', assignedUserIds: ['op-1'] }),
      makeEvent({ id: 'e2', name: 'Asante Funeral', assignedUserIds: ['op-1'] }),
    ];
    const text = (el: HTMLElement) => el.querySelector('.page-head')?.textContent ?? '';

    it('with 2+ active Events, the page-head names no Event until one is picked', async () => {
      const { fixture, component } = await setup(two);

      expect(component.activeEvent()).toBeNull();
      expect(text(fixture.nativeElement)).toContain('No Event picked yet');
    });

    it('names the picked Event in the page-head', async () => {
      const { fixture, ctx } = await setup(two);

      ctx.pick('e2');
      fixture.detectChanges();

      expect(text(fixture.nativeElement)).toContain('Asante Funeral');
    });

    it('"Record a donation" with no pick asks for a pick instead of navigating', async () => {
      const { fixture, ctx } = await setup(two);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('.page-head .btn-primary')!
        .click();

      expect(navigate).not.toHaveBeenCalled();
      expect(ctx.focusRequest()).toBe(1);
      expect(ctx.pickPrompt()).toContain('Pick an Event first');
    });

    it('"Record a donation" opens the desk for the single active Event', async () => {
      const { component } = await setup([two[0]]);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      component.recordDonation();

      expect(navigate).toHaveBeenCalledWith(['/organizer/entry'], { queryParams: { event: 'e1' } });
    });
  });

  describe('donation insights', () => {
    const NOW = new Date('2026-10-07T14:30:00Z');
    const one = [makeEvent({ id: 'e1', assignedUserIds: ['op-1'] })];
    const text = (fixture: { nativeElement: HTMLElement }) =>
      fixture.nativeElement.textContent?.replace(/\s+/g, ' ') ?? '';

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
    });

    afterEach(() => vi.useRealTimers());

    it('leaves no placeholder figures behind', async () => {
      const { fixture } = await setup(one);

      expect(text(fixture)).not.toContain('Available once donation recording ships');
    });

    it("shows today's figures against the same time yesterday", async () => {
      const donations = [
        makeDonation({ id: 'a', amountMinor: 30000, recordedAt: '2026-10-07T09:00:00Z' }),
        makeDonation({ id: 'b', amountMinor: 20000, recordedAt: '2026-10-06T09:00:00Z' }),
      ];
      const { fixture, component } = await setup(one, 'op-1', null, { donations });

      expect(component.kpis().raisedMinor).toBe(30000);
      expect(component.kpis().myCount).toBe(1);
      expect(text(fixture)).toContain('50% vs same time yesterday');
    });

    it('says nothing is recorded yet today rather than drawing empty charts', async () => {
      const { fixture } = await setup(one);

      expect(text(fixture)).toContain('No donations yet today');
    });

    it('switches period from the filter and remembers it for this user', async () => {
      const { fixture, component } = await setup(one);
      const options = fixture.nativeElement.querySelectorAll('[role="radio"]');

      (options[2] as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(component.period()).toBe('all');
      expect(localStorage.getItem(PERIOD_KEY)).toBe('all');
      expect(text(fixture)).toContain('Raised across your events');
    });

    it('starts on the remembered period', async () => {
      localStorage.setItem(PERIOD_KEY, 'event');
      const { component } = await setup(one);

      expect(component.period()).toBe('event');
    });

    it('reads every assigned Event for "All my events", leaving the picked one for the rest', async () => {
      localStorage.setItem(PERIOD_KEY, 'all');
      const two = [
        makeEvent({ id: 'e1', assignedUserIds: ['op-1'] }),
        makeEvent({ id: 'e2', assignedUserIds: ['op-1'] }),
      ];
      const { listDonationsForEvent } = await setup(two);

      expect(listDonationsForEvent).toHaveBeenCalledWith('e1');
      expect(listDonationsForEvent).toHaveBeenCalledWith('e2');
    });

    it('warns while donations are waiting to sync', async () => {
      const { fixture } = await setup(one, 'op-1', null, { pendingCount: 3 });

      expect(fixture.nativeElement.querySelector('.kpi-tile.is-warning')).not.toBeNull();
    });

    it('shows a retryable error when the donations cannot be read', async () => {
      const listDonationsForEvent = vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
      const { fixture, component } = await setup(one, 'op-1', null, { listDonationsForEvent });

      expect(component.dataState()).toBe('error');
      expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();

      listDonationsForEvent.mockResolvedValue([]);
      component.retryDonations();
      await settle();

      expect(component.dataState()).toBe('ready');
    });
  });
});
