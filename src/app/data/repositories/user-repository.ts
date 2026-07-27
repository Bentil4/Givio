import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../appwrite/client';
import { RepositoryError } from './repository-error';
import type { Role } from '../stores/auth-store';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserRepository {
  private readonly functions = inject(FUNCTIONS);

  /**
   * The only client-side entry point for a role change. Delegates to the one
   * Appwrite Function that's ever allowed to write a Label (AD-9) — never writes
   * a Label directly.
   */
  async changeRole(userId: string, role: Role): Promise<void> {
    let execution;
    try {
      execution = await this.functions.createExecution({
        functionId: environment.setRoleFunctionId,
        body: JSON.stringify({ userId, role }),
      });
    } catch (error) {
      throw new RepositoryError('Failed to invoke the role-change function', error);
    }

    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300) {
      throw new RepositoryError(
        `Role-change function rejected the request (status ${execution.responseStatusCode})`,
        execution.responseBody,
      );
    }
  }
}
