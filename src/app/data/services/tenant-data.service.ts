import { Injectable, inject } from '@angular/core';
import { Models, Query } from 'appwrite';
import { DATABASES } from '../../core/appwrite/client';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import type { Membership } from '../models/membership';

function rowToMembership(row: Models.DefaultRow): Membership {
  return {
    id: row['$id'],
    userId: row['userId'],
    tenantId: row['tenantId'],
    role: row['role'],
    status: row['status'],
    grantedBy: row['grantedBy'],
    grantedAt: row['grantedAt'],
  };
}

@Injectable({ providedIn: 'root' })
export class TenantDataService {
  private readonly databases = inject(DATABASES);
  private readonly authService = inject(AuthService);

  /**
   * The caller's own active Membership, if any — read directly (own-row read permission,
   * Story 6.2 Task 1), no Function call needed. Returns `null` for today's Admin caller (no
   * Membership exists), for anyone with no active Membership row, AND for a network/offline
   * failure (code-review fix — this is a live network call and every caller, notably
   * EventDataService.createEvent, must be able to treat "couldn't check" the same as "no
   * Membership" rather than have it propagate as an uncaught rejection; matches this file's
   * sibling Data-layer services, which never let a connectivity failure block their caller).
   */
  async getMyActiveMembership(): Promise<Membership | null> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      return null;
    }

    try {
      const page = await this.databases.listRows<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.membershipsCollectionId,
        queries: [
          Query.equal('userId', [currentUser.$id]),
          Query.equal('status', ['active']),
          Query.limit(1),
        ],
      });
      return page.rows.length > 0 ? rowToMembership(page.rows[0]) : null;
    } catch {
      return null;
    }
  }
}
