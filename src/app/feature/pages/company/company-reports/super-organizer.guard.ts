import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { TenantService } from '../../../../data/services/tenant.service';

/**
 * Story 8.5: settlement exports are the Super Organizer's alone. Client-side only — the data
 * itself is already read-scoped to the tenant by row security (AD-2). Runs under
 * approvedCompanyMatch, so the cached context is already loaded and active.
 */
export const superOrganizerMatch: CanMatchFn = async () => {
  const context = await inject(TenantService)
    .load()
    .catch(() => null);
  return context?.membership.role === 'super_organizer';
};
