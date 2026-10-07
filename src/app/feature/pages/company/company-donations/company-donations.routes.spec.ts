import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ACCOUNT } from '../../../../core/appwrite/client';
import { TenantService, type CompanyContext } from '../../../../data/services/tenant.service';
import type { MembershipRole } from '../../../../data/models/membership';
import type { TenantStatus } from '../../../../data/models/tenant';
import { COMPANY_ROUTES } from '../company.routes';
import {
  createCompanyDonationsBackend,
  provideCompanyDonationsBackend,
} from './company-donations-test-fixtures';

function contextFor(role: MembershipRole, status: TenantStatus = 'approved'): CompanyContext {
  return {
    membership: {
      id: 'm1',
      userId: 'u1',
      tenantId: 'tenant-a',
      role,
      status: 'active',
      grantedBy: 'u1',
      grantedAt: '2026-08-01T00:00:00.000Z',
    },
    tenant: {
      id: 'tenant-a',
      name: 'Asante Events',
      location: 'Kumasi',
      size: '11-50',
      type: 'funeral',
      estimatedUserCount: 12,
      status,
      superOrganizerId: 'u1',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
  };
}

describe('Company donation routes', () => {
  beforeAll(async () => {
    await Promise.all([
      import('../company-layout/company-layout'),
      import('../company-event-detail/company-event-detail'),
      import('./company-donations'),
      import('../pending-shell/pending-shell'),
    ]);
  });

  async function navigate(url: string, context: CompanyContext) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([...COMPANY_ROUTES, { path: 'login', children: [] }]),
        ...provideCompanyDonationsBackend(createCompanyDonationsBackend(), context.membership.role),
        { provide: ACCOUNT, useValue: { get: vi.fn(), deleteSession: vi.fn() } },
        {
          provide: TenantService,
          useValue: {
            load: vi.fn().mockResolvedValue(context),
            tenant: signal(context.tenant),
            context: signal(context),
            companyBrand: signal(null),
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    return harness.fixture.nativeElement as HTMLElement;
  }

  for (const role of ['super_organizer', 'organizer'] as const) {
    it(`opens /company/donations for a ${role}, with Donations in the sidebar`, async () => {
      const el = await navigate('/company/donations', contextFor(role));

      expect(el.querySelector('app-company-layout app-company-donations')).not.toBeNull();
      const link = el.querySelector('app-sidebar nav a[href="/company/donations"]');
      expect(link?.textContent).toContain('Donations');
    });

    it(`opens an event's detail page for a ${role}`, async () => {
      const el = await navigate('/company/events/e1', contextFor(role));

      expect(TestBed.inject(Router).url).toBe('/company/events/e1');
      expect(el.querySelector('app-company-layout app-company-event-detail')).not.toBeNull();
    });
  }

  it("keeps an unapproved tenant's people out of the donations pages", async () => {
    const el = await navigate('/company/donations', contextFor('super_organizer', 'pending'));

    expect(TestBed.inject(Router).url).toBe('/company');
    expect(el.querySelector('app-company-donations')).toBeNull();
    expect(el.querySelector('app-pending-shell')).not.toBeNull();
  });
});
