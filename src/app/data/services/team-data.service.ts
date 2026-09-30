import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../../core/appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import type { AddTeamMemberResult, TeamMember, TeamMemberRole } from '../models/team-member';

/**
 * Story 7.1's team actions. Memberships and Accounts aren't client-readable, so all three go
 * through the Function, which scopes them to the caller's own Tenant and enforces who may add
 * or revoke which role (FR-10/FR-11) — nothing here is trusted for that.
 */
@Injectable({ providedIn: 'root' })
export class TeamDataService {
  private readonly functions = inject(FUNCTIONS);

  async listTeamMembers(): Promise<TeamMember[]> {
    const { members } = await invokeAdminFunction<{ members: TeamMember[] }>(
      this.functions,
      'listTeamMembers',
      'Failed to load your team',
      {},
    );
    return members;
  }

  async addTeamMember(input: {
    name: string;
    email: string;
    role: TeamMemberRole;
  }): Promise<AddTeamMemberResult> {
    return invokeAdminFunction(this.functions, 'addTeamMember', 'Failed to add team member', input);
  }

  async revokeMembership(membershipId: string): Promise<void> {
    await invokeAdminFunction(this.functions, 'revokeMembership', 'Failed to revoke access', {
      membershipId,
    });
  }
}
