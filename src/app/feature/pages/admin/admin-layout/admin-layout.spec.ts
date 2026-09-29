import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ACCOUNT } from '../../../../core/appwrite/client';
import { AuthService } from '../../../../data/services/auth.service';

import { AdminLayout } from './admin-layout';

describe('AdminLayout', () => {
  let component: AdminLayout;
  let fixture: ComponentFixture<AdminLayout>;
  let account: { deleteSession: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    account = { deleteSession: vi.fn(), get: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [provideRouter([]), { provide: ACCOUNT, useValue: account }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminLayout);
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

  describe('Admins nav entry (Story 8.6)', () => {
    const hasAdminsLink = () =>
      component.navItems().some((item) => item.route === '/dashboard/admins');

    it('is hidden from an ordinary Admin', async () => {
      account.get.mockResolvedValueOnce({ labels: ['admin'] });
      await TestBed.inject(AuthService).restoreSession();

      expect(hasAdminsLink()).toBe(false);
    });

    it('is shown to the Super Admin, alongside every ordinary Admin entry', async () => {
      account.get.mockResolvedValueOnce({ labels: ['admin', 'super_admin'] });
      await TestBed.inject(AuthService).restoreSession();

      expect(hasAdminsLink()).toBe(true);
      expect(component.navItems().some((item) => item.route === '/dashboard/users')).toBe(true);
    });
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
