import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../appwrite/client';
import { RepositoryError } from './repository-error';
import type { Role } from '../models/role';
import type { AdminUser } from '../models/admin-user';
import { environment } from '../../../environments/environment';

interface FunctionErrorBody {
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class UserRepository {
  private readonly functions = inject(FUNCTIONS);

  /** Admin-only listing — Appwrite's Users service (list) is server-only. */
  async listUsers(): Promise<AdminUser[]> {
    const body = await this.invoke<AdminUser[]>('listUsers', 'Failed to list users', {});
    return body;
  }

  async createUser(input: {
    name: string;
    email: string;
    role: Role;
    password?: string;
  }): Promise<{ userId: string; generatedPassword?: string }> {
    return this.invoke('createUser', 'Failed to create user', input);
  }

  async updateUser(
    userId: string,
    patch: { name?: string; email?: string; role?: Role },
  ): Promise<void> {
    await this.invoke('updateUser', 'Failed to update user', { userId, ...patch });
  }

  async setUserActive(userId: string, active: boolean): Promise<void> {
    await this.invoke('setStatus', 'Failed to update user status', { userId, active });
  }

  async forceExpireSessions(userId: string): Promise<void> {
    await this.invoke('forceExpireSessions', 'Failed to force sign-out', { userId });
  }

  private async invoke<T>(action: string, invokeFailureMessage: string, payload: object): Promise<T> {
    let execution;
    try {
      execution = await this.functions.createExecution({
        functionId: environment.setRoleFunctionId,
        body: JSON.stringify({ action, ...payload }),
      });
    } catch (error) {
      throw new RepositoryError(invokeFailureMessage, error);
    }

    const parsedBody = this.parseBody(execution.responseBody);

    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300) {
      const message =
        (parsedBody as FunctionErrorBody | undefined)?.error ??
        `Admin-users function rejected the request (status ${execution.responseStatusCode})`;
      throw new RepositoryError(message, execution.responseBody);
    }

    return parsedBody as T;
  }

  private parseBody(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
}
