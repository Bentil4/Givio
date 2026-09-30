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
}
