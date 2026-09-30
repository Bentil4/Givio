import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthService, ROLE_HOME } from '../../data/services/auth.service';
import { CompanyContext, TenantService } from '../../data/services/tenant.service';
import type { MembershipRole } from '../../data/models/membership';

const COMPANY_ROLES: readonly MembershipRole[] = ['super_organizer', 'organizer'];

async function companyContext(tenantService: TenantService): Promise<CompanyContext | null> {
  try {
    const context = await tenantService.load();
    return context &&
      context.membership.status === 'active' &&
      COMPANY_ROLES.includes(context.membership.role)
      ? context
      : null;
  } catch {
    return null;
  }
}

/**
 * Matches the full /company shell (sidebar + child routes) only for an approved Tenant. Every
 * other state falls through to pendingCompanyMatch's route, which has no children to reach —
 * UI-side half of FR-9; the Function's rejectUnapprovedTenantMember is the server-side half.
 */
export const approvedCompanyMatch: CanMatchFn = async () => {
  const tenantService = inject(TenantService);
  const context = await companyContext(tenantService);
  return context?.tenant?.status === 'approved';
};

/** Any other Organizer-tier member lands on the pending shell; everyone else goes to /login. */
export const pendingCompanyMatch: CanMatchFn = async () => {
  const tenantService = inject(TenantService);
  const router = inject(Router);
  const context = await companyContext(tenantService);
  return context !== null || router.createUrlTree(['/login']);
};

/**
 * Applied to /auth/signup: a person who already holds a platform relationship is sent to it
 * instead of starting a second application on the same Account (FR-4/FR-5). An authenticated
 * Account with neither — a signup abandoned after step 1 — may resume the wizard.
 */
export const signupEntryGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const tenantService = inject(TenantService);
  const router = inject(Router);

  const role = authService.role();
  if (role !== null) {
    return router.createUrlTree([ROLE_HOME[role]]);
  }
  if (!authService.isAuthenticated()) {
    return true;
  }
  try {
    return (await tenantService.load(true)) === null || router.createUrlTree(['/company']);
  } catch {
    return router.createUrlTree(['/login']);
  }
};
