import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { TenantDataService } from './tenant-data.service';
import { TenantLifecycleDataService } from './tenant-lifecycle-data.service';
import { TenantService } from './tenant.service';

describe('TenantService', () => {
  let currentUser: { $id: string } | null;
  let role: string | null;
  let data: { getMyMembership: ReturnType<typeof vi.fn>; getTenant: ReturnType<typeof vi.fn> };
  let lifecycle: { getMyTenantSummary: ReturnType<typeof vi.fn> };
  let service: TenantService;

  const membership = {
    id: 'm1',
    userId: 'u1',
    tenantId: 't1',
    role: 'super_organizer',
    status: 'active',
  };

  beforeEach(() => {
    currentUser = { $id: 'u1' };
    role = null;
    data = { getMyMembership: vi.fn(), getTenant: vi.fn() };
    lifecycle = { getMyTenantSummary: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: () => currentUser, role: () => role } },
        { provide: TenantDataService, useValue: data },
        { provide: TenantLifecycleDataService, useValue: lifecycle },
      ],
    });
    service = TestBed.inject(TenantService);
  });

  it('loads the Membership and its Tenant once per user, and re-queries when forced', async () => {
    data.getMyMembership.mockResolvedValue(membership);
    data.getTenant.mockResolvedValue({ id: 't1', status: 'pending' });

    await service.load();
    await service.load();
    expect(data.getMyMembership).toHaveBeenCalledTimes(1);
    expect(service.tenant()?.status).toBe('pending');

    data.getTenant.mockResolvedValue({ id: 't1', status: 'approved' });
    await service.load(true);
    expect(data.getMyMembership).toHaveBeenCalledTimes(2);
    expect(service.tenant()?.status).toBe('approved');
  });

  it('reloads when a different user is signed in', async () => {
    data.getMyMembership.mockResolvedValue(null);
    await service.load();
    currentUser = { $id: 'u2' };
    await service.load();
    expect(data.getMyMembership).toHaveBeenCalledTimes(2);
  });

  it('keeps the Membership but no Tenant when the Tenant row is unreadable', async () => {
    data.getMyMembership.mockResolvedValue(membership);
    data.getTenant.mockRejectedValue(new Error('404'));

    const context = await service.load();

    expect(context?.membership).toBe(membership);
    expect(context?.tenant).toBeNull();
  });

  it('propagates a failed Membership lookup instead of reporting "no Membership"', async () => {
    data.getMyMembership.mockRejectedValue(new Error('offline'));
    await expect(service.load()).rejects.toThrow('offline');
  });

  it('returns null without querying when nobody is signed in', async () => {
    currentUser = null;
    expect(await service.load()).toBeNull();
    expect(data.getMyMembership).not.toHaveBeenCalled();
  });

  describe('companyBrand', () => {
    const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

    it("is the Organizer tier's Tenant name and logo", async () => {
      data.getMyMembership.mockResolvedValue(membership);
      data.getTenant.mockResolvedValue({ id: 't1', name: 'Adom Funerals', logo: LOGO });

      await service.load();

      expect(service.companyBrand()).toEqual({ name: 'Adom Funerals', logo: LOGO });
    });

    it("is just the Tenant's name when it has no logo", async () => {
      data.getMyMembership.mockResolvedValue(membership);
      data.getTenant.mockResolvedValue({ id: 't1', name: 'Adom Funerals' });

      await service.load();

      expect(service.companyBrand()).toEqual({ name: 'Adom Funerals' });
    });

    it("is an Operator's company from the status check, without a second call", async () => {
      role = 'operator';
      lifecycle.getMyTenantSummary.mockResolvedValue({
        status: 'approved',
        name: 'Adom Funerals',
        logo: LOGO,
      });

      await service.isOperatorTenantSuspended();
      await service.isOperatorTenantSuspended();

      expect(service.companyBrand()).toEqual({ name: 'Adom Funerals', logo: LOGO });
      expect(lifecycle.getMyTenantSummary).toHaveBeenCalledTimes(1);
    });

    it("never shows a previous Operator's company to the next signed-in user", async () => {
      role = 'operator';
      lifecycle.getMyTenantSummary.mockResolvedValue({
        status: 'approved',
        name: 'Adom Funerals',
        logo: null,
      });
      await service.isOperatorTenantSuspended();

      currentUser = { $id: 'u2' };

      expect(service.companyBrand()).toBeNull();
    });

    it('is null for an Operator whose company could not be checked', async () => {
      role = 'operator';
      lifecycle.getMyTenantSummary.mockRejectedValue(new Error('offline'));

      expect(await service.isOperatorTenantSuspended()).toBe(false);
      expect(service.companyBrand()).toBeNull();
    });
  });
});
