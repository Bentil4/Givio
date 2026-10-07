import { Injectable, inject } from '@angular/core';
import type { Models } from 'appwrite';
import { FUNCTIONS } from '../../core/appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { rowToAuditLogEntry } from './audit-log-writer';
import type { TenantAuditPage } from '../models/audit-log';

interface TenantAuditResponse {
  entries: Models.DefaultRow[];
  nextCursor: string | null;
}

/**
 * Story 7.5 (FR-15): a Super Organizer's own tenant's audit trail. A company's audit_logs rows
 * carry no client read at all (AD-12, amended 2026-10-07), so the read goes through the
 * Function, which resolves the tenant from the caller's own Membership and filters
 * server-side — no tenantId is sent from here, and nothing in this service narrows the result:
 * what comes back is all the caller may see.
 */
@Injectable({ providedIn: 'root' })
export class TenantAuditDataService {
  private readonly functions = inject(FUNCTIONS);

  async listTenantAuditPage(cursor: string | null): Promise<TenantAuditPage> {
    const page = await invokeAdminFunction<TenantAuditResponse>(this.functions, {
      action: 'listTenantAuditLog',
      invokeFailureMessage: "We couldn't load your activity log",
      payload: cursor ? { cursor } : {},
    });
    return { entries: page.entries.map(rowToAuditLogEntry), nextCursor: page.nextCursor };
  }
}
