import { TestBed } from '@angular/core/testing';
import { UrlTree, provideRouter } from '@angular/router';
import { AuthService } from '../../data/services/auth.service';
import { CompanyContext, TenantService } from '../../data/services/tenant.service';
import type { MembershipRole, MembershipStatus } from '../../data/models/membership';
import type { TenantStatus } from '../../data/models/tenant';
import { approvedCompanyMatch, pendingCompanyMatch, signupEntryGuard } from './tenant.guard';

function context(
  tenantStatus: TenantStatus,
  role: MembershipRole = 'super_organizer',
  status: MembershipStatus = 'active',
): CompanyContext {
  return {
    membership: {
      id: 'm1',
      userId: 'u1',
      tenantId: 't1',
      role,
      status,
      grantedBy: 'u1',
      grantedAt: '2026-09-30T00:00:00.000Z',
    },
    tenant: {
      id: 't1',
      name: 'Asante Events',
      location: 'Kumasi',
      size: '11-50',
      type: 'funeral',
      estimatedUserCount: 12,
      status: tenantStatus,
      superOrganizerId: 'u1',
      createdAt: '2026-09-30T00:00:00.000Z',
    },
  };
}

describe('tenant.guard', () => {
  let load: ReturnType<typeof vi.fn>;
  let auth: { role: () => string | null; isAuthenticated: () => boolean };

  beforeEach(() => {
    load = vi.fn();
    auth = { role: () => null, isAuthenticated: () => true };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TenantService, useValue: { load } },
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  const run = (guard: (...args: never[]) => unknown) =>
    TestBed.runInInjectionContext(() => guard({} as never, [] as never));

  describe('approvedCompanyMatch', () => {
    it('matches an approved tenant', async () => {
      load.mockResolvedValue(context('approved'));
      expect(await run(approvedCompanyMatch)).toBe(true);
    });

    for (const status of ['pending', 'rejected', 'suspended'] as const) {
      it(`does not match a ${status} tenant`, async () => {
        load.mockResolvedValue(context(status));
        expect(await run(approvedCompanyMatch)).toBe(false);
      });
    }

    it('does not match an operator Membership, a revoked Membership, or a failed lookup', async () => {
      load.mockResolvedValueOnce(context('approved', 'operator'));
      expect(await run(approvedCompanyMatch)).toBe(false);
      load.mockResolvedValueOnce(context('approved', 'super_organizer', 'revoked'));
      expect(await run(approvedCompanyMatch)).toBe(false);
      load.mockRejectedValueOnce(new Error('offline'));
      expect(await run(approvedCompanyMatch)).toBe(false);
    });
  });

  describe('pendingCompanyMatch', () => {
    it('matches any active Organizer-tier member', async () => {
      load.mockResolvedValue(context('pending', 'organizer'));
      expect(await run(pendingCompanyMatch)).toBe(true);
    });

    it('redirects someone with no Membership to /login', async () => {
      load.mockResolvedValue(null);
      const result = await run(pendingCompanyMatch);
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/login');
    });
  });

  describe('signupEntryGuard', () => {
    it('lets an anonymous visitor start the wizard without any lookup', async () => {
      auth.isAuthenticated = () => false;
      expect(await run(signupEntryGuard)).toBe(true);
      expect(load).not.toHaveBeenCalled();
    });

    it('sends Admins and Operators to their own home', async () => {
      auth.role = () => 'admin';
      expect(((await run(signupEntryGuard)) as UrlTree).toString()).toBe('/dashboard');
      auth.role = () => 'operator';
      expect(((await run(signupEntryGuard)) as UrlTree).toString()).toBe('/organizer');
    });

    it('sends someone who already has a Membership to /company', async () => {
      load.mockResolvedValue(context('pending'));
      expect(((await run(signupEntryGuard)) as UrlTree).toString()).toBe('/company');
    });

    it('lets a signed-in Account with no Membership resume the wizard', async () => {
      load.mockResolvedValue(null);
      expect(await run(signupEntryGuard)).toBe(true);
    });
  });
});
