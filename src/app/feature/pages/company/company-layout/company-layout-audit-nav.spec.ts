import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../../data/services/auth.service';
import { CompanyContext, TenantService } from '../../../../data/services/tenant.service';
import type { MembershipRole } from '../../../../data/models/membership';
import { CompanyLayout } from './company-layout';

/** Story 7.5: the Activity log nav item exists only for the tenant's Super Organizer. */
describe('CompanyLayout activity log nav item', () => {
  async function renderAs(role: MembershipRole): Promise<HTMLElement> {
    const context = signal({ membership: { role } } as CompanyContext);
    TestBed.configureTestingModule({
      imports: [CompanyLayout],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { logout: vi.fn(), currentUser: () => null } },
        { provide: TenantService, useValue: { context, companyBrand: signal(null) } },
      ],
    });
    const fixture = TestBed.createComponent(CompanyLayout);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('is listed for the Super Organizer', async () => {
    const el = await renderAs('super_organizer');

    const link = el.querySelector('app-sidebar nav a[href="/company/audit"]');
    expect(link?.textContent).toContain('Activity log');
  });

  it('is hidden from a co-Organizer', async () => {
    const el = await renderAs('organizer');

    expect(el.querySelector('app-sidebar nav a[href="/company/audit"]')).toBeNull();
  });
});
