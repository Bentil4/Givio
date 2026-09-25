export type MembershipRole = 'super_organizer' | 'organizer' | 'operator';
export type MembershipStatus = 'active' | 'revoked';

/** Mirrors the `memberships` table row shape exactly (Story 6.2) — the sole source of a
 *  tenant-scoped role (AD-1 amended). */
export interface Membership {
  id: string;
  userId: string;
  tenantId: string;
  role: MembershipRole;
  status: MembershipStatus;
  grantedBy: string;
  grantedAt: string;
}
