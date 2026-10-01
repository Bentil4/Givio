import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { TenantDataService } from './tenant-data.service';
import { TenantLifecycleDataService } from './tenant-lifecycle-data.service';
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
  private readonly lifecycleData = inject(TenantLifecycleDataService);

  private readonly _context = signal<CompanyContext | null>(null);
  private loadedForUserId: string | null = null;
  private readonly _suspendedSignOut = signal(false);
  private operatorSuspension: { userId: string; suspended: boolean } | null = null;

  public readonly context = this._context.asReadonly();
  public readonly tenant = computed(() => this._context()?.tenant ?? null);
  /** Story 9.2 AC3: set when a suspended tenant's member was just signed out, for /login. */
  public readonly suspendedSignOut = this._suspendedSignOut.asReadonly();

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

  /**
   * Story 9.2 AC3: Operators can't read their Tenant row, so their tenant's status comes from
   * the Function, cached per user like load(). Fails open — an offline Operator keeps working
   * locally, and the Function's own gate still refuses a suspended tenant's every write.
   */
  async isOperatorTenantSuspended(force = false): Promise<boolean> {
    const userId = this.authService.currentUser()?.$id ?? null;
    if (userId === null || this.authService.role() !== 'operator') {
      return false;
    }
    if (!force && this.operatorSuspension?.userId === userId) {
      return this.operatorSuspension.suspended;
    }
    const suspended = await this.fetchOwnTenantSuspended();
    this.operatorSuspension = { userId, suspended };
    return suspended;
  }

  private async fetchOwnTenantSuspended(): Promise<boolean> {
    try {
      return (await this.lifecycleData.getMyTenantStatus()) === 'suspended';
    } catch {
      return false;
    }
  }

  /** Ends the session of a suspended tenant's member and flags it for the sign-in screen. */
  async signOutSuspendedMember(): Promise<void> {
    this._suspendedSignOut.set(true);
    await this.authService.logout();
  }

  clearSuspendedSignOut(): void {
    this._suspendedSignOut.set(false);
  }
}
