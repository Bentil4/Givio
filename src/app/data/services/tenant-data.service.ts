import { Injectable, inject } from '@angular/core';
import { ID, Models, Permission, Query, Role } from 'appwrite';
import { DATABASES, FUNCTIONS, STORAGE } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import type { Membership } from '../models/membership';
import type { CompanyIntake, Tenant } from '../models/tenant';

export interface InviteOrganizerResult {
  userId: string;
  tenantId: string;
  membershipId: string;
  generatedPassword: string;
  inviteStatus: { email?: 'sent' | 'failed' };
}

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

function rowToTenant(row: Models.DefaultRow): Tenant {
  return {
    id: row['$id'],
    name: row['name'],
    location: row['location'],
    size: row['size'],
    type: row['type'],
    estimatedUserCount: row['estimatedUserCount'],
    status: row['status'],
    superOrganizerId: row['superOrganizerId'],
    verificationDocumentId: row['verificationDocumentId'] ?? undefined,
    verifiedBy: row['verifiedBy'] ?? undefined,
    verifiedAt: row['verifiedAt'] ?? undefined,
    createdAt: row['createdAt'],
  };
}

@Injectable({ providedIn: 'root' })
export class TenantDataService {
  private readonly databases = inject(DATABASES);
  private readonly functions = inject(FUNCTIONS);
  private readonly storage = inject(STORAGE);
  private readonly authService = inject(AuthService);

  /**
   * The caller's own Membership row in any status (one per Account, enforced by the
   * `userId_unique` index). Unlike getMyActiveMembership, a failed lookup throws rather than
   * collapsing into "none" — login routing and the /company guards must tell "has no
   * Membership" apart from "couldn't check".
   */
  async getMyMembership(): Promise<Membership | null> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      return null;
    }
    try {
      const page = await this.databases.listRows<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.membershipsCollectionId,
        queries: [Query.equal('userId', [currentUser.$id]), Query.limit(1)],
      });
      return page.rows.length > 0 ? rowToMembership(page.rows[0]) : null;
    } catch (error) {
      throw new ServiceError('Failed to load your membership', error);
    }
  }

  /** Readable by Admin and the Tenant's Super Organizer (row permissions set by the Function). */
  async getTenant(tenantId: string): Promise<Tenant> {
    try {
      const row = await this.databases.getRow<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.tenantsCollectionId,
        rowId: tenantId,
      });
      return rowToTenant(row);
    } catch (error) {
      throw new ServiceError('Failed to load your company', error);
    }
  }

  /**
   * Uploads as the signed-in applicant, before any Tenant exists — the Function later accepts
   * the file only if these creator permissions are still on it, then locks it read-only.
   */
  async uploadVerificationDocument(file: File): Promise<string> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      throw new ServiceError('Sign in before uploading a document');
    }
    const self = Role.user(currentUser.$id);
    try {
      const uploaded = await this.storage.createFile({
        bucketId: environment.tenantDocumentsBucketId,
        fileId: ID.unique(),
        file,
        permissions: [Permission.read(self), Permission.update(self), Permission.delete(self)],
      });
      return uploaded.$id;
    } catch (error) {
      throw new ServiceError('The document upload failed', error);
    }
  }

  async submitTenantApplication(input: {
    company: CompanyIntake;
    verificationDocumentId: string;
  }): Promise<{ tenantId: string; membershipId: string }> {
    return invokeAdminFunction(
      this.functions,
      'submitTenantApplication',
      'Failed to submit the application',
      input,
    );
  }

  /** Admin-only (FR-6 path a) — the UI hook for Story 6.5's Admin screens. */
  async inviteOrganizer(input: {
    name: string;
    email: string;
    company: CompanyIntake;
  }): Promise<InviteOrganizerResult> {
    return invokeAdminFunction(
      this.functions,
      'inviteOrganizer',
      'Failed to invite organizer',
      input,
    );
  }

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
