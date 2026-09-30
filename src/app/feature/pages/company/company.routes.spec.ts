import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ACCOUNT } from '../../../core/appwrite/client';
import { CompanyContext, TenantService } from '../../../data/services/tenant.service';
import type { Tenant, TenantStatus } from '../../../data/models/tenant';
import { COMPANY_ROUTES } from './company.routes';

function contextFor(status: TenantStatus): CompanyContext {
  const tenant: Tenant = {
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
  return {
    membership: {
      id: 'm1',
      userId: 'org-1',
      tenantId: 't1',
      role: 'super_organizer',
      status: 'active',
      grantedBy: 'org-1',
      grantedAt: '2026-09-28T10:00:00.000Z',
    },
    tenant,
  };
}

describe('COMPANY_ROUTES', () => {
  async function navigate(url: string, context: CompanyContext | null) {
    const tenant = signal(context?.tenant ?? null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([...COMPANY_ROUTES, { path: 'login', children: [] }]),
        { provide: ACCOUNT, useValue: { get: vi.fn(), deleteSession: vi.fn() } },
        {
          provide: TenantService,
          useValue: { load: vi.fn().mockResolvedValue(context), tenant, context: signal(context) },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    return { harness, el: harness.fixture.nativeElement as HTMLElement };
  }

  for (const status of ['pending', 'rejected', 'suspended'] as const) {
    it(`renders only the full-page shell — no sidebar or nav at all — for a ${status} tenant`, async () => {
      const { el } = await navigate('/company', contextFor(status));

      expect(el.querySelector('app-pending-shell')).not.toBeNull();
      expect(el.querySelector('app-sidebar')).toBeNull();
      expect(el.querySelector('app-company-layout')).toBeNull();
      expect(el.querySelector('nav')).toBeNull();
    });
  }

  it('collapses any deeper /company URL onto the pending shell for an unapproved tenant', async () => {
    const { el } = await navigate('/company/team', contextFor('pending'));

    expect(TestBed.inject(Router).url).toBe('/company');
    expect(el.querySelector('app-pending-shell')).not.toBeNull();
    expect(el.querySelector('app-company-dashboard')).toBeNull();
  });

  it('renders the company layout with its sidebar and the dashboard for an approved tenant', async () => {
    const { el } = await navigate('/company', contextFor('approved'));

    expect(el.querySelector('app-company-layout app-sidebar')).not.toBeNull();
    expect(el.querySelector('app-company-dashboard')).not.toBeNull();
    expect(el.querySelector('app-pending-shell')).toBeNull();
  });

  for (const status of ['pending', 'rejected', 'suspended'] as const) {
    it(`lets a ${status} tenant reach the Contact Admin form without the company layout`, async () => {
      const { el } = await navigate('/company/support', contextFor(status));

      expect(TestBed.inject(Router).url).toBe('/company/support');
      expect(el.querySelector('app-pending-support app-company-support')).not.toBeNull();
      expect(el.querySelector('app-company-layout')).toBeNull();
    });
  }

  it('renders the Contact Admin form inside the company layout for an approved tenant', async () => {
    const { el } = await navigate('/company/support', contextFor('approved'));

    expect(el.querySelector('app-company-layout app-company-support')).not.toBeNull();
    expect(el.querySelector('app-pending-support')).toBeNull();
  });

  it('serves the dispute form to an anonymous visitor with no tenant — no redirect to /login', async () => {
    const { el } = await navigate('/company/dispute', null);

    expect(TestBed.inject(Router).url).toBe('/company/dispute');
    expect(el.querySelector('app-company-dispute')).not.toBeNull();
    expect(TestBed.inject(TenantService).load).not.toHaveBeenCalled();
  });

  it('sends a person with no Organizer-tier Membership to /login', async () => {
    const { el } = await navigate('/company', null);

    expect(TestBed.inject(Router).url).toBe('/login');
    expect(el.querySelector('app-pending-shell')).toBeNull();
    expect(el.querySelector('app-company-layout')).toBeNull();
  });
});
