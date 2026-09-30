import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { TenantDataService } from './tenant-data.service';
import type { Membership } from '../models/membership';
import type { Tenant } from '../models/tenant';

export interface CompanyContext {
  membership: Membership;
  /** null when the row isn't readable by this member — treated as not approved. */
  tenant: Tenant | null;
}

/**
 * The signed-in person's own tenant relationship, shared by the /company guards, the
 * company shell and login routing so one navigation doesn't re-query it per consumer. Cached
 * per user id; callers that need a fresh answer (login, "check again") pass `force`.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly authService = inject(AuthService);
  private readonly tenantData = inject(TenantDataService);

  private readonly _context = signal<CompanyContext | null>(null);
  private loadedForUserId: string | null = null;

  public readonly context = this._context.asReadonly();
  public readonly tenant = computed(() => this._context()?.tenant ?? null);

  /** Throws ServiceError when the lookup itself fails — never reports that as "no tenant". */
  async load(force = false): Promise<CompanyContext | null> {
    const userId = this.authService.currentUser()?.$id ?? null;
    if (userId === null) {
      this.loadedForUserId = null;
      this._context.set(null);
      return null;
    }
    if (!force && this.loadedForUserId === userId) {
      return this._context();
    }

    const membership = await this.tenantData.getMyMembership();
    let context: CompanyContext | null = null;
    if (membership) {
      const tenant = await this.tenantData.getTenant(membership.tenantId).catch(() => null);
      context = { membership, tenant };
    }
    this._context.set(context);
    this.loadedForUserId = userId;
    return context;
  }
}
