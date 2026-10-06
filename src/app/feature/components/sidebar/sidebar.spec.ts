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

  describe('profile footer', () => {
    const profile = {
      name: 'Ama Mensah',
      email: 'ama@givio.test',
      tierLabel: 'Super Organizer',
      tierIcon: 'domain',
    };

    it('shows the signed-in name, initials and tier badge', async () => {
      fixture.componentRef.setInput('profile', profile);
      await fixture.whenStable();
      const footer: HTMLElement = fixture.nativeElement.querySelector('.user-profile');

      expect(footer.querySelector('.user-initials')?.textContent?.trim()).toBe('AM');
      expect(footer.querySelector('.user-name')?.textContent).toContain('Ama Mensah');
      expect(footer.querySelector('.tier-badge')?.textContent).toContain('Super Organizer');
    });

    it('links to settings when a settings route is given', async () => {
      fixture.componentRef.setInput('profile', { ...profile, settingsRoute: '/company/settings' });
      await fixture.whenStable();

      const link = fixture.nativeElement.querySelector('a.user-profile');
      expect(link.getAttribute('href')).toBe('/company/settings');
    });

    it('renders no profile block while the account is unknown', () => {
      expect(fixture.nativeElement.querySelector('.user-profile')).toBeNull();
    });

    it('no longer shows the placeholder notification badge', () => {
      expect(fixture.nativeElement.textContent).not.toContain('2min ago');
    });
  });

  describe('brand', () => {
    it('shows the Givio logo by default', () => {
      expect(fixture.nativeElement.querySelector('img.logo').getAttribute('alt')).toBe('Givio');
    });

    it("shows the company's logo instead of Givio's", async () => {
      fixture.componentRef.setInput('brand', {
        name: 'First Event',
        logo: 'data:image/png;base64,x',
      });
      await fixture.whenStable();

      const logo = fixture.nativeElement.querySelector('img.brand-logo');
      expect(logo.getAttribute('alt')).toBe('First Event logo');
      expect(fixture.nativeElement.querySelector('img.logo')).toBeNull();
    });

    it('shows the company name and initials when it has no logo', async () => {
      fixture.componentRef.setInput('brand', { name: 'First Event' });
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.brand-name').textContent).toContain(
        'First Event',
      );
      expect(fixture.nativeElement.querySelector('.brand-initials').textContent).toContain('FE');
    });
  });

  describe('nav badge', () => {
    it('shows a count and announces it with the link', async () => {
      fixture.componentRef.setInput('navItems', [
        { name: 'Approvals', icon: 'how_to_reg', route: '/dashboard/approvals', badge: 3 },
      ]);
      await fixture.whenStable();

      const link = fixture.nativeElement.querySelector('a.nav-link');
      expect(link.querySelector('.nav-badge').textContent).toContain('3');
      expect(link.getAttribute('aria-label')).toBe('Approvals, 3 pending');
    });

    it('hides the badge at zero', async () => {
      fixture.componentRef.setInput('navItems', [
        { name: 'Approvals', icon: 'how_to_reg', route: '/dashboard/approvals', badge: 0 },
      ]);
      await fixture.whenStable();

      const link = fixture.nativeElement.querySelector('a.nav-link');
      expect(link.querySelector('.nav-badge')).toBeNull();
      expect(link.getAttribute('aria-label')).toBeNull();
    });
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
