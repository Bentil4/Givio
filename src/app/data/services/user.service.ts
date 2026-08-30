import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import type { Role } from '../models/role';
import type { AdminUser } from '../models/admin-user';

@Injectable({ providedIn: 'root' })
export class UserService {
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

  private invoke<T>(action: string, invokeFailureMessage: string, payload: object): Promise<T> {
    return invokeAdminFunction<T>(this.functions, action, invokeFailureMessage, payload);
  }
}
