import { Injectable, computed, inject, signal } from '@angular/core';
import { AppwriteException, Models } from 'appwrite';
import { ACCOUNT } from '../appwrite/client';

export type Role = 'admin' | 'operator';

const ROLE_LABELS: readonly Role[] = ['admin', 'operator'];

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  operator: '/organizer',
};

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly account = inject(ACCOUNT);
  private readonly _currentUser = signal<Models.User<Models.Preferences> | null>(null);

  public readonly currentUser = this._currentUser.asReadonly();

  public readonly role = computed<Role | null>(() => {
    const labels = this._currentUser()?.labels ?? [];
    return ROLE_LABELS.find((role) => labels.includes(role)) ?? null;
  });

  public readonly isAuthenticated = computed(() => this._currentUser() !== null);

  async login(email: string, password: string): Promise<void> {
    try {
      await this.account.deleteSession({ sessionId: 'current' });
    } catch {
      /* no active session to clear */
    }
    await this.account.createEmailPasswordSession({ email, password });
    this._currentUser.set(await this.account.get());
  }

  /**
   * Always resolves — the caller can rely on `logout()` completing and safely navigate
   * afterward, even if the server-side session was already gone or unreachable.
   */
  async logout(): Promise<void> {
    try {
      await this.account.deleteSession({ sessionId: 'current' });
    } catch {
      /* session may already be invalid/expired server-side; local state still clears below */
    } finally {
      this._currentUser.set(null);
    }
  }

  /**
   * Always resolves — an unreachable Appwrite instance or unexpected error is treated as
   * "no session" so a transient failure never blocks the app from bootstrapping.
   */
  async restoreSession(): Promise<void> {
    try {
      this._currentUser.set(await this.account.get());
    } catch (error) {
      this._currentUser.set(null);
      const isExpectedNoSession = error instanceof AppwriteException && error.code === 401;
      if (!isExpectedNoSession) {
        console.error('AuthStore.restoreSession: unexpected error, treating as logged out', error);
      }
    }
  }
}
