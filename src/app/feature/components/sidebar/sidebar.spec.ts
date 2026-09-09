import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  let component: Sidebar;
  let fixture: ComponentFixture<Sidebar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      // A catch-all route so a real RouterLink click resolves instead of throwing NG04002.
      providers: [provideRouter([{ path: '**', children: [] }])],
    }).compileComponents();

    fixture = TestBed.createComponent(Sidebar);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('navItems', []);
    fixture.componentRef.setInput('userProfile', []);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits logout when the logout button is clicked', async () => {
    const logoutSpy = vi.fn();
    component.logout.subscribe(logoutSpy);

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.logout-button');
    button.click();
    await fixture.whenStable();

    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });

  it('renders a disabled nav item as an inert span, not a routerLink', async () => {
    fixture.componentRef.setInput('navItems', [
      { name: 'Report', icon: 'bar_chart', route: '/organizer/report', disabled: true },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a.nav-link');
    const disabled = fixture.nativeElement.querySelector('span.nav-link.is-disabled');

    expect(link).toBeNull();
    expect(disabled).not.toBeNull();
    expect(disabled.textContent).toContain('Report');
  });

  describe('mobile off-canvas drawer (Story 5.1)', () => {
    it('renders no scrim and no mobile-open class when closed', () => {
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.sidebar-scrim')).toBeNull();
      expect(fixture.nativeElement.querySelector('aside.sidebar.mobile-open')).toBeNull();
    });

    it('renders a scrim and the mobile-open class when open', async () => {
      fixture.componentRef.setInput('mobileOpen', true);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.sidebar-scrim')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('aside.sidebar.mobile-open')).not.toBeNull();
    });

    it('clicking the scrim emits dismissMobile', async () => {
      fixture.componentRef.setInput('mobileOpen', true);
      await fixture.whenStable();
      fixture.detectChanges();

      const dismissSpy = vi.fn();
      component.dismissMobile.subscribe(dismissSpy);
      fixture.nativeElement.querySelector('.sidebar-scrim').click();

      expect(dismissSpy).toHaveBeenCalledTimes(1);
    });

    it('pressing Escape on the drawer emits dismissMobile', async () => {
      fixture.componentRef.setInput('mobileOpen', true);
      await fixture.whenStable();
      fixture.detectChanges();

      const dismissSpy = vi.fn();
      component.dismissMobile.subscribe(dismissSpy);
      fixture.nativeElement
        .querySelector('aside.sidebar')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(dismissSpy).toHaveBeenCalledTimes(1);
    });

    it('clicking a nav link emits dismissMobile so navigating closes the drawer', async () => {
      fixture.componentRef.setInput('navItems', [
        { name: 'Events', icon: 'event', route: '/organizer/events' },
      ]);
      fixture.componentRef.setInput('mobileOpen', true);
      await fixture.whenStable();
      fixture.detectChanges();

      const dismissSpy = vi.fn();
      component.dismissMobile.subscribe(dismissSpy);
      fixture.nativeElement.querySelector('a.nav-link').click();
      // The click also triggers a real (async) RouterLink navigation — let it settle before
      // the test tears down, or it rejects into the next test as an unhandled error.
      await fixture.whenStable();

      expect(dismissSpy).toHaveBeenCalledTimes(1);
    });
  });
});
