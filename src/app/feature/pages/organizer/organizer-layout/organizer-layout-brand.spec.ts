import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ACCOUNT } from '../../../../core/appwrite/client';
import { AuthService } from '../../../../data/services/auth.service';
import { EventService } from '../../../../data/services/event.service';
import { TenantLifecycleDataService } from '../../../../data/services/tenant-lifecycle-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import type { OwnTenantSummary } from '../../../../data/models/tenant';
import { OrganizerLayout } from './organizer-layout';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

/** Operators can't read their Tenant row — the brand comes from operatorTenantGuard's call. */
describe('OrganizerLayout company brand', () => {
  async function renderFor(summary: OwnTenantSummary): Promise<HTMLElement> {
    const currentUser = () => ({ $id: 'op-1', name: 'Operator One', email: 'op@givio.test' });
    TestBed.configureTestingModule({
      imports: [OrganizerLayout],
      providers: [
        provideRouter([]),
        { provide: ACCOUNT, useValue: { deleteSession: vi.fn(), get: vi.fn() } },
        {
          provide: AuthService,
          useValue: { currentUser, role: () => 'operator', logout: vi.fn() },
        },
        { provide: EventService, useValue: { events: signal([]), loadEvents: vi.fn() } },
        {
          provide: TenantLifecycleDataService,
          useValue: { getMyTenantSummary: async () => summary },
        },
      ],
    });
    await TestBed.inject(TenantService).isOperatorTenantSuspended();
    const fixture = TestBed.createComponent(OrganizerLayout);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it("shows the Operator's company logo from the status call", async () => {
    const el = await renderFor({ status: 'approved', name: 'Adom Funerals', logo: LOGO });
    const logo = el.querySelector<HTMLImageElement>('app-sidebar img.brand-logo');

    expect(logo?.getAttribute('src')).toBe(LOGO);
    expect(logo?.alt).toBe('Adom Funerals logo');
  });

  it("shows the Operator's company name when it has no logo", async () => {
    const el = await renderFor({ status: 'approved', name: 'Adom Funerals', logo: null });

    expect(el.querySelector('app-sidebar .brand-name')?.textContent).toContain('Adom Funerals');
  });

  it("links the Operator's profile and a Settings nav item to /organizer/settings", async () => {
    const el = await renderFor({ status: 'approved', name: 'Adom Funerals', logo: null });

    const profileLink = el.querySelector('app-sidebar a.user-profile');
    expect(profileLink?.getAttribute('href')).toBe('/organizer/settings');
    const navLink = el.querySelector('app-sidebar nav a[href="/organizer/settings"]');
    expect(navLink?.textContent).toContain('Settings');
  });
});
