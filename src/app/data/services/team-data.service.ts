import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../../core/appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import type {
  AddTeamMemberResult,
  RevocationChoice,
  TeamMember,
  TeamMemberRole,
} from '../models/team-member';

/**
 * Story 7.1's team actions. Memberships and Accounts aren't client-readable, so all three go
 * through the Function, which scopes them to the caller's own Tenant and enforces who may add
 * or revoke which role (FR-10/FR-11) — nothing here is trusted for that.
 */
@Injectable({ providedIn: 'root' })
export class TeamDataService {
  private readonly functions = inject(FUNCTIONS);

  async listTeamMembers(): Promise<TeamMember[]> {
    const { members } = await invokeAdminFunction<{ members: TeamMember[] }>(this.functions, {
      action: 'listTeamMembers',
      invokeFailureMessage: 'Failed to load your team',
      payload: {},
    });
    return members;
  }

  async addTeamMember(input: {
    name: string;
    email: string;
    role: TeamMemberRole;
  }): Promise<AddTeamMemberResult> {
    return invokeAdminFunction(this.functions, {
      action: 'addTeamMember',
      invokeFailureMessage: 'Failed to add team member',
      payload: input,
    });
  }

  /** Re-sending the same revoke is how a partly failed one (a 5xx) is finished. */
  async revokeMembership(membershipId: string, choice: RevocationChoice): Promise<void> {
    await invokeAdminFunction(this.functions, {
      action: 'revokeMembership',
      invokeFailureMessage: 'Failed to revoke access',
      payload: { membershipId, ...choice },
    });
  }
}
