import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../../data/services/auth.service';
import { TenantService } from '../../../../data/services/tenant.service';
import type { Tenant, TenantStatus } from '../../../../data/models/tenant';
import { PendingShell } from './pending-shell';

function tenantWith(status: TenantStatus): Tenant {
  return {
    id: 't1',
    name: 'Asante Events',
    location: 'Kumasi',
    size: '11-50',
    type: 'funeral',
    estimatedUserCount: 12,
    status,
    superOrganizerId: 'org-1',
    createdAt: '2026-09-28T10:00:00.000Z',
  };
}

describe('PendingShell', () => {
  let load: ReturnType<typeof vi.fn>;
  let logout: ReturnType<typeof vi.fn>;

  async function render(tenant: Tenant | null) {
    load = vi.fn();
    logout = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [PendingShell],
      providers: [
        provideRouter([]),
        { provide: TenantService, useValue: { tenant: signal(tenant), load } },
        { provide: AuthService, useValue: { logout } },
      ],
    });
    const fixture = TestBed.createComponent(PendingShell);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    return { fixture, el: fixture.nativeElement as HTMLElement, router };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the under-review message with the submitted date and no navigation at all', async () => {
    const { el } = await render(tenantWith('pending'));

    expect(el.querySelector('h1')?.textContent).toContain('Your application is under review');
    expect(el.textContent).toContain('Submitted');
    expect(el.querySelector('nav')).toBeNull();
    expect(el.querySelector('app-sidebar')).toBeNull();
    const links = el.querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/company/support');
  });

  // A suspended tenant's member is signed out instead — see pending-shell-suspended.spec.ts.
  for (const status of ['pending', 'rejected'] as const) {
    it(`links a ${status} tenant to the Contact Admin form`, async () => {
      const { el } = await render(tenantWith(status));

      const link = el.querySelector<HTMLAnchorElement>('a[href="/company/support"]');
      expect(link?.textContent?.trim()).toBe('Contact Admin');
    });
  }

  it('moves focus to the heading on render', async () => {
    const { el } = await render(tenantWith('pending'));

    expect(document.activeElement).toBe(el.querySelector('h1'));
  });

  it('shows a generic "not approved" message for a rejected tenant — no reason, no submitted date', async () => {
    const { el } = await render(tenantWith('rejected'));

    expect(el.querySelector('h1')?.textContent).toContain("This application wasn't approved");
    expect(el.textContent).not.toContain('Submitted');
    expect(el.textContent?.toLowerCase()).not.toMatch(/reason|because|flag|fraud|identity/);
    expect(el.querySelector('nav')).toBeNull();
  });

  it('navigates to /company when a re-check finds the tenant approved', async () => {
    const { fixture, router } = await render(tenantWith('pending'));
    load.mockResolvedValueOnce({ tenant: tenantWith('approved') });

    await fixture.componentInstance.checkAgain();

    expect(load).toHaveBeenCalledWith(true);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/company');
  });

  it('announces that nothing changed when a re-check is still pending', async () => {
    const { fixture, el, router } = await render(tenantWith('pending'));
    load.mockResolvedValueOnce({ tenant: tenantWith('pending') });

    await fixture.componentInstance.checkAgain();
    fixture.detectChanges();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('nothing has changed');
  });

  it('signs out to /login', async () => {
    const { fixture, router } = await render(tenantWith('pending'));

    await fixture.componentInstance.signOut();

    expect(logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
