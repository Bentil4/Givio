import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ACCOUNT } from '../../../../core/appwrite/client';
import { AuthService } from '../../../../data/services/auth.service';
import { ApprovalCountsService } from '../../../../data/services/approval-counts.service';

import { AdminLayout } from './admin-layout';

describe('AdminLayout', () => {
  let component: AdminLayout;
  let fixture: ComponentFixture<AdminLayout>;
  let account: { deleteSession: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let router: Router;
  let approvalCounts: {
    total: WritableSignal<number>;
    pollWhileAlive: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    account = { deleteSession: vi.fn(), get: vi.fn() };
    approvalCounts = { total: signal(0), pollWhileAlive: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [
        provideRouter([]),
        { provide: ACCOUNT, useValue: account },
        { provide: ApprovalCountsService, useValue: approvalCounts },
      ],
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
      account.get.mockResolvedValueOnce({ name: 'A', email: 'a@givio.test', labels: ['admin'] });
      await TestBed.inject(AuthService).restoreSession();

      expect(hasAdminsLink()).toBe(false);
    });

    it('is shown to the Super Admin, alongside every ordinary Admin entry', async () => {
      account.get.mockResolvedValueOnce({
        name: 'S',
        email: 's@givio.test',
        labels: ['admin', 'superadmin'],
      });
      await TestBed.inject(AuthService).restoreSession();

      expect(hasAdminsLink()).toBe(true);
      expect(component.navItems().some((item) => item.route === '/dashboard/users')).toBe(true);
    });
  });

  describe('sidebar profile', () => {
    it('labels an ordinary Admin', async () => {
      account.get.mockResolvedValueOnce({ name: 'Kofi', email: 'k@givio.test', labels: ['admin'] });
      await TestBed.inject(AuthService).restoreSession();

      expect(component.profile()?.tierLabel).toBe('Admin');
      expect(component.profile()?.name).toBe('Kofi');
    });

    it('labels the Super Admin', async () => {
      account.get.mockResolvedValueOnce({
        name: 'Darko',
        email: 'd@givio.test',
        labels: ['admin', 'superadmin'],
      });
      await TestBed.inject(AuthService).restoreSession();

      expect(component.profile()?.tierLabel).toBe('Super Admin');
    });
  });

  it('offers no Events, Donations or Reports entry (AD-12, amended 2026-10-07)', () => {
    const routes = component.navItems().map((item) => item.route);

    expect(routes).toEqual([
      '/dashboard',
      '/dashboard/approvals',
      '/dashboard/companies',
      '/dashboard/audit',
      '/dashboard/users',
    ]);
  });

  it('links every Admin to the Approvals queue (Story 6.5)', () => {
    expect(component.navItems().some((item) => item.route === '/dashboard/approvals')).toBe(true);
  });

  it('shows the pending approvals count as the Approvals badge, and starts polling it', () => {
    const approvalsBadge = () =>
      component.navItems().find((item) => item.route === '/dashboard/approvals')?.badge;

    expect(approvalCounts.pollWhileAlive).toHaveBeenCalledOnce();
    expect(approvalsBadge()).toBe(0);

    approvalCounts.total.set(4);

    expect(approvalsBadge()).toBe(4);
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
