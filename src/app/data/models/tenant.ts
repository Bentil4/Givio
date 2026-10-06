export type TenantStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

// Keep in sync with functions/set-role-and-permissions/src/tenant-membership/validation.js's
// TENANT_SIZES/TENANT_TYPES — the Function validates against its own copy.
export const TENANT_SIZES = ['1-10', '11-50', '51-200', '201+'] as const;
export const TENANT_TYPES = ['funeral', 'wedding', 'funeral_and_wedding', 'other'] as const;

export type TenantSize = (typeof TENANT_SIZES)[number];
export type TenantType = (typeof TENANT_TYPES)[number];

export const TENANT_SIZE_LABELS: Record<TenantSize, string> = {
  '1-10': '1–10 people',
  '11-50': '11–50 people',
  '51-200': '51–200 people',
  '201+': 'More than 200 people',
};

export const TENANT_TYPE_LABELS: Record<TenantType, string> = {
  funeral: 'Funeral services',
  wedding: 'Wedding services',
  funeral_and_wedding: 'Funerals and weddings',
  other: 'Other events',
};

/**
 * Mirrors the `tenants` table row shape exactly (Story 6.2; verificationDocumentId, 6.4).
 * contactPhone is optional because applications submitted before it existed have none.
 */
export interface Tenant {
  id: string;
  name: string;
  location: string;
  size: string;
  type: string;
  estimatedUserCount: number;
  contactPhone?: string;
  status: TenantStatus;
  superOrganizerId: string;
  verificationDocumentId?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  /** A PNG/JPEG data URL shown in its members' sidebar; absent until one is uploaded. */
  logo?: string;
  createdAt: string;
}

/** What a member may learn about their own tenant without reading its row (Operators can't). */
export interface OwnTenantSummary {
  status: TenantStatus | null;
  name: string | null;
  logo: string | null;
}

/** What a Super Organizer may change about their own company; null clears a field. */
export interface CompanyProfile {
  name: string;
  location: string;
  /** E.164. */
  contactPhone: string | null;
  /** A PNG/JPEG data URL. Left out of an update, the logo stays as it is. */
  logo?: string | null;
}

/** The self-signup wizard's step-1 intake (FR-7) — the Function sets every other Tenant field. */
export interface CompanyIntake {
  name: string;
  location: string;
  size: TenantSize;
  type: TenantType;
  estimatedUserCount: number;
  /** E.164; required by self-signup, optional on an Admin invite. */
  contactPhone?: string;
}
