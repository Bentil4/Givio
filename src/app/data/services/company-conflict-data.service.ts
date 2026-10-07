import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../../core/appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import type { ConflictResolution, TenantConflict } from '../models/donation';

/**
 * A Super Organizer's sync-conflict queue for their own company's Events. donation_conflicts
 * rows are Admin-read only, so both the list and the resolution go through the Function, which
 * scopes them to the caller's Tenant and applies Admin's own resolution rules.
 */
@Injectable({ providedIn: 'root' })
export class CompanyConflictDataService {
  private readonly functions = inject(FUNCTIONS);

  async listConflicts(): Promise<TenantConflict[]> {
    const { conflicts } = await invokeAdminFunction<{ conflicts: TenantConflict[] }>(
      this.functions,
      {
        action: 'listTenantConflicts',
        invokeFailureMessage: "We couldn't load the sync conflicts",
        payload: {},
      },
    );
    return conflicts;
  }

  async resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<void> {
    await invokeAdminFunction(this.functions, {
      action: 'resolveTenantConflict',
      invokeFailureMessage: "We couldn't resolve the conflict",
      payload: { conflictId, resolution },
    });
  }
}
