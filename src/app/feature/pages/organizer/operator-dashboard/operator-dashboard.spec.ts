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

async function setup(events: Event[], userId = 'op-1', brand: SidebarBrand | null = null) {
  const loadEvents = vi.fn().mockResolvedValue(undefined);
  await TestBed.configureTestingModule({
    imports: [OperatorDashboard],
    providers: [
      provideRouter([]),
      { provide: EventService, useValue: { events: signal(events).asReadonly(), loadEvents } },
      { provide: AuthService, useValue: { currentUser: () => ({ $id: userId }) } },
      { provide: TenantService, useValue: { companyBrand: signal(brand) } },
      OperatorEventContext,
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(OperatorDashboard);
  const component = fixture.componentInstance;
  await component.ngOnInit();
  fixture.detectChanges();
  return { fixture, component, loadEvents, ctx: TestBed.inject(OperatorEventContext) };
}

describe('OperatorDashboard', () => {
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
});
