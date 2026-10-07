import { Injectable, inject } from '@angular/core';
import { AppwriteException, ID, Models, Permission, Query, Role } from 'appwrite';
import { DATABASES, FUNCTIONS, STORAGE } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import type { Membership } from '../models/membership';
import type { CompanyIntake, CompanyProfile, Tenant } from '../models/tenant';

export interface InviteOrganizerResult {
  userId: string;
  tenantId: string;
  membershipId: string;
  generatedPassword: string;
  inviteStatus: { email?: 'sent' | 'failed' };
}

export interface TenantVerification {
  verifiedBy: string;
  verifiedAt: string;
}

export interface VerificationDocument {
  name: string;
  mimeType: string;
  sizeBytes: number;
  viewUrl: string;
}

export type TenantDecision = 'approved' | 'rejected';

const PENDING_PAGE_SIZE = 100;

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

export function rowToTenant(row: Models.DefaultRow): Tenant {
  return {
    id: row['$id'],
    name: row['name'],
    location: row['location'],
    size: row['size'],
    type: row['type'],
    estimatedUserCount: row['estimatedUserCount'],
    contactPhone: row['contactPhone'] ?? undefined,
    status: row['status'],
    superOrganizerId: row['superOrganizerId'],
    verificationDocumentId: row['verificationDocumentId'] ?? undefined,
    verifiedBy: row['verifiedBy'] ?? undefined,
    verifiedAt: row['verifiedAt'] ?? undefined,
    logo: row['logo'] ?? undefined,
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
   * `userId_unique` index). A failed lookup throws rather than collapsing into "none" —
   * login routing and the /company guards must tell "has no Membership" apart from "couldn't
   * check".
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
    company: CompanyIntake & { contactPhone: string };
    verificationDocumentId: string;
  }): Promise<{ tenantId: string; membershipId: string }> {
    return invokeAdminFunction(this.functions, {
      action: 'submitTenantApplication',
      invokeFailureMessage: 'Failed to submit the application',
      payload: input,
    });
  }

  /** Super Organizer only — the Function resolves the tenant from the caller and refuses anyone
   *  else, so no tenantId is sent. */
  async updateCompanyProfile(profile: CompanyProfile): Promise<CompanyProfile> {
    const { tenant } = await invokeAdminFunction<{ tenant: CompanyProfile }>(this.functions, {
      action: 'updateCompanyProfile',
      invokeFailureMessage: "Couldn't save your company details",
      payload: profile,
    });
    return tenant;
  }

  /** Admin-only (FR-6 path a) — the UI hook for Story 6.5's Admin screens. */
  async inviteOrganizer(input: {
    name: string;
    email: string;
    company: CompanyIntake;
  }): Promise<InviteOrganizerResult> {
    return invokeAdminFunction(this.functions, {
      action: 'inviteOrganizer',
      invokeFailureMessage: 'Failed to invite organizer',
      payload: input,
    });
  }

  /**
   * Admin-only (Story 6.5): every pending application, oldest first so the queue is worked in
   * the order people applied. Admin reads the tenants table through its collection-level
   * read("label:admin") permission.
   */
  async listPendingTenants(): Promise<Tenant[]> {
    const tenants = await this.fetchAllPendingTenantRows().catch((error: unknown) => {
      throw new ServiceError('Failed to load pending applications', error);
    });
    return tenants.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private async fetchAllPendingTenantRows(): Promise<Tenant[]> {
    const tenants: Tenant[] = [];
    let cursor: string | undefined;
    for (;;) {
      const queries = [Query.equal('status', ['pending']), Query.limit(PENDING_PAGE_SIZE)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const page = await this.databases.listRows<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.tenantsCollectionId,
        queries,
      });
      tenants.push(...page.rows.map(rowToTenant));
      if (page.rows.length < PENDING_PAGE_SIZE) break;
      cursor = page.rows[page.rows.length - 1].$id;
    }
    return tenants;
  }

  /**
   * Admin-only. `null` means the file is gone from the bucket — a distinct, reviewable state,
   * not a load failure; any other failure throws.
   */
  async getVerificationDocument(fileId: string): Promise<VerificationDocument | null> {
    const bucketId = environment.tenantDocumentsBucketId;
    try {
      const file = await this.storage.getFile({ bucketId, fileId });
      return {
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeOriginal,
        viewUrl: this.storage.getFileView({ bucketId, fileId }),
      };
    } catch (error) {
      if (error instanceof AppwriteException && error.code === 404) {
        return null;
      }
      throw new ServiceError('Failed to load the verification document', error);
    }
  }

  /** Admin-only (FR-8): attests that both the document review and the phone call are done. */
  async recordTenantVerification(tenantId: string): Promise<TenantVerification> {
    const body = await invokeAdminFunction<TenantVerification>(this.functions, {
      action: 'recordTenantVerification',
      invokeFailureMessage: 'Failed to record the verification',
      payload: { tenantId, documentReviewed: true, phoneVerified: true },
    });
    return { verifiedBy: body.verifiedBy, verifiedAt: body.verifiedAt };
  }

  /** Admin-only. The Function refuses 'approved' until verification is recorded (FR-8). */
  async decideTenantApplication(tenantId: string, status: TenantDecision): Promise<void> {
    await invokeAdminFunction(this.functions, {
      action: 'setTenantStatus',
      invokeFailureMessage:
        status === 'approved'
          ? 'Failed to approve the application'
          : 'Failed to reject the application',
      payload: { tenantId, status },
    });
  }
}
