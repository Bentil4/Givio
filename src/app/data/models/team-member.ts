import type { MembershipRole, MembershipStatus } from './membership';

/** One row of the listTeamMembers Function action: a Membership joined with its Account. */
export interface TeamMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: MembershipRole;
  status: MembershipStatus;
  grantedAt: string;
  isSelf: boolean;
}

/** The roles addTeamMember accepts — a tenant's single Super Organizer is never added this way. */
export type TeamMemberRole = Exclude<MembershipRole, 'super_organizer'>;

export interface AddTeamMemberResult {
  userId: string;
  membershipId: string;
  name: string;
  role: TeamMemberRole;
  generatedPassword: string;
  /** The Membership exists, but granting its sign-in/company access failed server-side. */
  setupIncomplete: boolean;
  /** Whether the Function emailed the credentials; absent on older Function versions. */
  inviteStatus?: { email?: 'sent' | 'failed' };
}

/**
 * Story 7.3 (FR-13/FR-24): every revoke is one or the other, never a generic "revoke". Keep in
 * sync with the Function's validation.js (ROUTINE_REVOCATION/FOR_CAUSE_REVOCATION).
 */
export type RevocationReason = 'routine' | 'for_cause';

/** What the revoker chose; `explanation` is required for, and only sent with, for-cause. */
export interface RevocationChoice {
  reason: RevocationReason;
  explanation?: string;
}
