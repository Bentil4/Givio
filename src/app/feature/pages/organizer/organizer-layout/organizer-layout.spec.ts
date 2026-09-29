import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ACCOUNT } from '../../../../core/appwrite/client';
import { AuthService } from '../../../../data/services/auth.service';
import { EventService } from '../../../../data/services/event.service';
import type { Event } from '../../../../data/models/event';
import { OperatorEventContext } from '../operator-event-context';

import { OrganizerLayout } from './organizer-layout';

describe('OrganizerLayout', () => {
  let component: OrganizerLayout;
  let fixture: ComponentFixture<OrganizerLayout>;
  let account: { deleteSession: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    account = { deleteSession: vi.fn(), get: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [OrganizerLayout],
      providers: [
        provideRouter([]),
        { provide: ACCOUNT, useValue: account },
        { provide: EventService, useValue: { events: signal([]), loadEvents: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizerLayout);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('onLogout logs out and navigates to /login', async () => {
    account.deleteSession.mockResolvedValueOnce({});

    await component.onLogout();

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('onLogout still navigates to /login even if the Appwrite session deletion fails', async () => {
    account.deleteSession.mockRejectedValueOnce(new Error('network error'));

    await component.onLogout();

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  describe('mobile nav drawer (Story 5.1)', () => {
    it('toggleMobileNav flips isMobileNavOpen', () => {
      expect(component.isMobileNavOpen()).toBe(false);

      component.toggleMobileNav();
      expect(component.isMobileNavOpen()).toBe(true);

      component.toggleMobileNav();
      expect(component.isMobileNavOpen()).toBe(false);
    });

    it('closeMobileNav always sets isMobileNavOpen to false', () => {
      component.toggleMobileNav();
      expect(component.isMobileNavOpen()).toBe(true);

      component.closeMobileNav();
      expect(component.isMobileNavOpen()).toBe(false);
    });
  });
});

describe('OrganizerLayout event switcher (Story 6.6)', () => {
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

  async function setup(events: Event[]) {
    await TestBed.configureTestingModule({
      imports: [OrganizerLayout],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: ACCOUNT, useValue: { deleteSession: vi.fn(), get: vi.fn() } },
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ $id: 'op-1' }), logout: vi.fn() },
        },
        { provide: EventService, useValue: { events: signal(events), loadEvents: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(OrganizerLayout);
    fixture.detectChanges();
    await fixture.whenStable();
    const ctx = fixture.debugElement.injector.get(OperatorEventContext);
    const router = TestBed.inject(Router);
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, ctx, router, el };
  }

  const two = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2', name: 'Asante Funeral' })];

  it('does not render the switcher for a single active Event', async () => {
    const { el } = await setup([two[0]]);
    expect(el.querySelector('app-event-switcher')).toBeNull();
  });

  it('renders the switcher in the header for 2+ active Events, with nothing picked', async () => {
    const { el, ctx } = await setup(two);
    expect(el.querySelector('header.event-bar app-event-switcher')).not.toBeNull();
    expect(ctx.activeEvent()).toBeNull();
  });

  it('treats an `event` query param as an explicit pick', async () => {
    const { fixture, ctx, router } = await setup(two);

    await router.navigateByUrl('/organizer/entry?event=e2');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(ctx.activeEvent()?.id).toBe('e2');
  });

  it('a switcher pick on an Event-scoped URL rewrites that URL to the new Event', async () => {
    const { fixture, ctx, router } = await setup(two);
    await router.navigateByUrl('/organizer/entry?event=e1');
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.onEventPicked('e2');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(ctx.activeEvent()?.id).toBe('e2');
    expect(router.url).toBe('/organizer/entry?event=e2');
  });

  it('a switcher pick on a page without an Event in its URL leaves the URL alone', async () => {
    const { fixture, ctx, router } = await setup(two);
    await router.navigateByUrl('/organizer');

    fixture.componentInstance.onEventPicked('e2');
    await fixture.whenStable();

    expect(ctx.activeEvent()?.id).toBe('e2');
    expect(router.url).toBe('/organizer');
  });
});
