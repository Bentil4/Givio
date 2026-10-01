import type { MembershipRole, MembershipStatus } from './membership';
import type { TeamMemberRole } from './team-member';

/** `open`: a flagged addition awaiting a decision; `unmatched`: a co-Organizer addition to note. */
export type IdentityReviewStatus = 'open' | 'unmatched';

export type IdentityReviewDecision = 'confirm' | 'clear' | 'acknowledge';

export type IdentityMatchField = 'name' | 'email' | 'phone';

/** One thing a screened addition matched, as the Function snapshotted it at screening time. */
export interface IdentityMatch {
  source: 'identity_flag' | 'same_tenant';
  id: string;
  fields: IdentityMatchField[];
  name: string;
  email: string | null;
  phone: string | null;
  /** identity_flag only. */
  reason?: string;
  flaggedAt?: string;
  /** same_tenant only: that person's Membership at the adding company. */
  role?: MembershipRole;
  status?: MembershipStatus;
}

/** One row of the listIdentityReviews Function action (Story 7.2). */
export interface IdentityReview {
  reviewId: string;
  membershipId: string;
  tenantId: string;
  tenantName: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: TeamMemberRole;
  matched: boolean;
  matches: IdentityMatch[];
  status: IdentityReviewStatus;
  createdAt: string;
}
