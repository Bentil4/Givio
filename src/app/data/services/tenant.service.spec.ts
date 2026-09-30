import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { TenantDataService } from './tenant-data.service';
import { TenantService } from './tenant.service';

describe('TenantService', () => {
  let currentUser: { $id: string } | null;
  let data: { getMyMembership: ReturnType<typeof vi.fn>; getTenant: ReturnType<typeof vi.fn> };
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
    data = { getMyMembership: vi.fn(), getTenant: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: () => currentUser } },
        { provide: TenantDataService, useValue: data },
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
});
