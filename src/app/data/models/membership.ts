export type MembershipRole = 'super_organizer' | 'organizer' | 'operator';
/** `pending_review`: a screened team addition held, with no access, until Admin decides (7.2). */
export type MembershipStatus = 'active' | 'revoked' | 'pending_review';

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
