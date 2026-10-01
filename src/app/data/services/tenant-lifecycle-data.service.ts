import { Injectable, inject } from '@angular/core';
import { Models, Query } from 'appwrite';
import { DATABASES, FUNCTIONS } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { rowToTenant } from './tenant-data.service';
import { environment } from '../../../environments/environment';
import type { Tenant, TenantStatus } from '../models/tenant';
import type { AddTeamMemberResult, TeamMember } from '../models/team-member';

const TENANT_PAGE_SIZE = 100;

/**
 * Story 8.1 (FR-19): Admin's whole-tenant account actions, plus the one status read a tenant's
 * own member makes about it (Story 9.2 AC3). Every write goes through the Function, which is
 * what refuses a non-Admin — nothing here is trusted for that.
 */
@Injectable({ providedIn: 'root' })
export class TenantLifecycleDataService {
  private readonly databases = inject(DATABASES);
  private readonly functions = inject(FUNCTIONS);

  /** Admin-only: every tenant in any status, read through the label:admin collection grant. */
  async listTenants(): Promise<Tenant[]> {
    const tenants = await this.fetchAllTenantRows().catch((error: unknown) => {
      throw new ServiceError('Failed to load companies', error);
    });
    return tenants.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Resolves only once the status, the grant sweep AND every member's sign-out are confirmed;
   * a partial suspension rejects with the Function's FunctionRejectedError (502).
   */
  async suspendTenant(tenantId: string): Promise<void> {
    await invokeAdminFunction(this.functions, {
      action: 'suspendTenant',
      invokeFailureMessage: "Couldn't reach the server to suspend this company",
      payload: { tenantId },
    });
  }

  /** suspended → approved; the Function's grant recompute restores every Membership's access. */
  async reinstateTenant(tenantId: string): Promise<void> {
    await invokeAdminFunction(this.functions, {
      action: 'setTenantStatus',
      invokeFailureMessage: "Couldn't reach the server to reinstate this company",
      payload: { tenantId, status: 'approved' },
    });
  }

  async listTenantMembers(tenantId: string): Promise<TeamMember[]> {
    const { members } = await invokeAdminFunction<{ members: TeamMember[] }>(this.functions, {
      action: 'listTeamMembers',
      invokeFailureMessage: "Failed to load this company's team",
      payload: { tenantId },
    });
    return members;
  }

  /** A newly added person joins as an Organizer, who can then be designated. */
  async addOrganizer(
    tenantId: string,
    person: { name: string; email: string },
  ): Promise<AddTeamMemberResult> {
    return invokeAdminFunction(this.functions, {
      action: 'addTeamMember',
      invokeFailureMessage: 'Failed to add the organizer',
      payload: { ...person, tenantId, role: 'organizer' },
    });
  }

  async designateSuperOrganizer(tenantId: string, membershipId: string): Promise<void> {
    await invokeAdminFunction(this.functions, {
      action: 'designateSuperOrganizer',
      invokeFailureMessage: 'Failed to designate the Super Organizer',
      payload: { tenantId, membershipId },
    });
  }

  /** The caller's own tenant status — Operators can't read their Tenant row directly. */
  async getMyTenantStatus(): Promise<TenantStatus | null> {
    const { tenantStatus } = await invokeAdminFunction<{ tenantStatus: TenantStatus | null }>(
      this.functions,
      {
        action: 'getMyTenantStatus',
        invokeFailureMessage: 'Failed to check your company status',
        payload: {},
      },
    );
    return tenantStatus;
  }

  private async fetchAllTenantRows(): Promise<Tenant[]> {
    const tenants: Tenant[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.fetchTenantPage(cursor);
      tenants.push(...page.map(rowToTenant));
      if (page.length < TENANT_PAGE_SIZE) {
        return tenants;
      }
      cursor = page[page.length - 1].$id;
    }
  }

  private async fetchTenantPage(cursor: string | undefined): Promise<Models.DefaultRow[]> {
    const queries = [Query.limit(TENANT_PAGE_SIZE)];
    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }
    const page = await this.databases.listRows<Models.DefaultRow>({
      databaseId: environment.appwriteDatabaseId,
      tableId: environment.tenantsCollectionId,
      queries,
    });
    return page.rows;
  }
}
