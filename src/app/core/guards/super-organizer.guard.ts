import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { TenantService } from '../../data/services/tenant.service';

/**
 * A /company page only the tenant's Super Organizer may open — the audit log (Story 7.5) and
 * settlement reports (Story 8.5). Client-side only: the Function re-checks the role on every
 * call and row security scopes the data (AD-2), which are the real boundaries. Runs under
 * approvedCompanyMatch, so the cached context is already loaded and active.
 */
export const superOrganizerMatch: CanMatchFn = async () => {
  const context = await inject(TenantService)
    .load()
    .catch(() => null);
  return context?.membership.role === 'super_organizer';
};
