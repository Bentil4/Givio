import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../../data/services/auth.service';
import { TenantDataService } from '../../../../data/services/tenant-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import type { Tenant } from '../../../../data/models/tenant';
import { CompanyLayout } from './company-layout';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

/** The sidebar shows the signed-in member's company instead of the Givio wordmark. */
describe('CompanyLayout company brand', () => {
  async function renderFor(tenant: Partial<Tenant>): Promise<HTMLElement> {
    const membership = { userId: 'u1', tenantId: 't1', role: 'organizer', status: 'active' };
    const currentUser = () => ({ $id: 'u1', name: 'Ama Mensah', email: 'ama@givio.test' });
    TestBed.configureTestingModule({
      imports: [CompanyLayout],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { logout: vi.fn(), currentUser } },
        {
          provide: TenantDataService,
          useValue: { getMyMembership: async () => membership, getTenant: async () => tenant },
        },
      ],
    });
    await TestBed.inject(TenantService).load();
    const fixture = TestBed.createComponent(CompanyLayout);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it("shows the tenant's logo in the sidebar", async () => {
    const sidebar = (await renderFor({ name: 'Adom Funerals', logo: LOGO })).querySelector(
      'app-sidebar',
    );
    const logo = sidebar?.querySelector<HTMLImageElement>('img.brand-logo');

    expect(logo?.getAttribute('src')).toBe(LOGO);
    expect(logo?.alt).toBe('Adom Funerals logo');
  });

  it("shows the tenant's name when it has no logo", async () => {
    const sidebar = (await renderFor({ name: 'Adom Funerals' })).querySelector('app-sidebar');

    expect(sidebar?.querySelector('.brand-name')?.textContent).toContain('Adom Funerals');
    expect(sidebar?.querySelector('img.brand-logo')).toBeNull();
  });
});
