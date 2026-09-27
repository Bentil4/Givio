import { TestBed } from '@angular/core/testing';
import { TenantDataService } from './tenant-data.service';
import { AuthService } from './auth.service';
import { DATABASES } from '../../core/appwrite/client';

describe('TenantDataService', () => {
  let service: TenantDataService;
  let databases: { listRows: ReturnType<typeof vi.fn> };
  let currentUser: { $id: string } | null;

  beforeEach(() => {
    databases = { listRows: vi.fn() };
    currentUser = { $id: 'user-1' };
    TestBed.configureTestingModule({
      providers: [
        { provide: DATABASES, useValue: databases },
        { provide: AuthService, useValue: { currentUser: () => currentUser } },
      ],
    });
    service = TestBed.inject(TenantDataService);
  });

  describe('getMyActiveMembership', () => {
    it('returns null when there is no signed-in user', async () => {
      currentUser = null;

      const result = await service.getMyActiveMembership();

      expect(result).toBeNull();
      expect(databases.listRows).not.toHaveBeenCalled();
    });

    it('returns null when the caller has no active Membership row', async () => {
      databases.listRows.mockResolvedValueOnce({ rows: [] });

      const result = await service.getMyActiveMembership();

      expect(result).toBeNull();
    });

    it('returns null (never throws) when the lookup fails — e.g. offline', async () => {
      databases.listRows.mockRejectedValueOnce(new Error('offline'));

      const result = await service.getMyActiveMembership();

      expect(result).toBeNull();
    });

    it("maps the first matching row and queries by the caller's own userId and active status", async () => {
      databases.listRows.mockResolvedValueOnce({
        rows: [
          {
            $id: 'membership-1',
            userId: 'user-1',
            tenantId: 'tenant-1',
            role: 'super_organizer',
            status: 'active',
            grantedBy: 'admin-1',
            grantedAt: '2026-09-25T00:00:00.000Z',
          },
        ],
      });

      const result = await service.getMyActiveMembership();

      expect(result).toEqual({
        id: 'membership-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'super_organizer',
        status: 'active',
        grantedBy: 'admin-1',
        grantedAt: '2026-09-25T00:00:00.000Z',
      });
      expect(databases.listRows).toHaveBeenCalledWith(
        expect.objectContaining({
          queries: expect.arrayContaining([
            expect.stringContaining('user-1'),
            expect.stringContaining('active'),
          ]),
        }),
      );
    });
  });
});
