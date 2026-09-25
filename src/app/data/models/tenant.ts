export type TenantStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

/** Mirrors the `tenants` table row shape exactly (Story 6.2). */
export interface Tenant {
  id: string;
  name: string;
  location: string;
  size: string;
  type: string;
  estimatedUserCount: number;
  status: TenantStatus;
  superOrganizerId: string;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
}
