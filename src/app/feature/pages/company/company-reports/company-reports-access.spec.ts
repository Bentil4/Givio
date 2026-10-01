import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../../data/services/auth.service';
import { CompanyContext, TenantService } from '../../../../data/services/tenant.service';
import type { MembershipRole } from '../../../../data/models/membership';
import { CompanyLayout } from '../company-layout/company-layout';
import { superOrganizerMatch } from './super-organizer.guard';

function contextFor(role: MembershipRole): CompanyContext {
  return {
    membership: {
      id: 'm1',
      userId: 'u1',
      tenantId: 't1',
      role,
      status: 'active',
      grantedBy: 'u1',
      grantedAt: '2026-08-01T00:00:00.000Z',
    },
    tenant: null,
  };
}

describe('Settlement reports access (Super Organizer only)', () => {
  function provideContext(context: CompanyContext | null) {
    TestBed.configureTestingModule({
      imports: [CompanyLayout],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { logout: vi.fn() } },
        {
          provide: TenantService,
          useValue: { context: signal(context), load: vi.fn().mockResolvedValue(context) },
        },
      ],
    });
  }

  const runGuard = () =>
    TestBed.runInInjectionContext(() => superOrganizerMatch({} as never, [] as never, {} as never));

  it('matches the route for a Super Organizer', async () => {
    provideContext(contextFor('super_organizer'));

    expect(await runGuard()).toBe(true);
  });

  it('does not match for an Organizer', async () => {
    provideContext(contextFor('organizer'));

    expect(await runGuard()).toBe(false);
  });

  it('does not match when the context lookup fails', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TenantService, useValue: { load: vi.fn().mockRejectedValue(new Error('x')) } },
      ],
    });

    expect(await runGuard()).toBe(false);
  });

  it('lists Reports in the sidebar only for a Super Organizer', async () => {
    provideContext(contextFor('super_organizer'));
    const fixture = TestBed.createComponent(CompanyLayout);
    fixture.detectChanges();
    await fixture.whenStable();

    const link = (fixture.nativeElement as HTMLElement).querySelector(
      'app-sidebar nav a[href="/company/reports"]',
    );
    expect(link?.textContent).toContain('Reports');
  });

  it('hides Reports from an Organizer', async () => {
    provideContext(contextFor('organizer'));
    const fixture = TestBed.createComponent(CompanyLayout);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[href="/company/reports"]')).toBeNull();
  });
});
