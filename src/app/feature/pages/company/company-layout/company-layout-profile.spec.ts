import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../../data/services/auth.service';
import { CompanyContext, TenantService } from '../../../../data/services/tenant.service';
import type { MembershipRole } from '../../../../data/models/membership';
import { CompanyLayout } from './company-layout';

describe('CompanyLayout sidebar profile', () => {
  async function renderAs(role: MembershipRole): Promise<HTMLElement> {
    const context = signal({ membership: { role } } as CompanyContext);
    const currentUser = () => ({ name: 'Ama Mensah', email: 'ama@givio.test' });
    TestBed.configureTestingModule({
      imports: [CompanyLayout],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { logout: vi.fn(), currentUser } },
        { provide: TenantService, useValue: { context, companyBrand: signal(null) } },
      ],
    });
    const fixture = TestBed.createComponent(CompanyLayout);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it("shows the signed-in Super Organizer's name and tier", async () => {
    const footer = (await renderAs('super_organizer')).querySelector('.user-profile');

    expect(footer?.textContent).toContain('Ama Mensah');
    expect(footer?.textContent).toContain('Super Organizer');
  });

  it('labels a co-Organizer as Organizer', async () => {
    const footer = (await renderAs('organizer')).querySelector('.user-profile');

    expect(footer?.textContent).toContain('Organizer');
    expect(footer?.textContent).not.toContain('Super Organizer');
  });

  for (const role of ['super_organizer', 'organizer'] as const) {
    it(`links a ${role}'s profile and a Settings nav item to /company/settings`, async () => {
      const el = await renderAs(role);

      expect(el.querySelector('a.user-profile')?.getAttribute('href')).toBe('/company/settings');
      const navLink = el.querySelector('app-sidebar nav a[href="/company/settings"]');
      expect(navLink?.textContent).toContain('Settings');
    });
  }
});
