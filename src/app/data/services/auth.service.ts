import { Injectable, computed, inject, signal } from '@angular/core';
import { AppwriteException, Models } from 'appwrite';
import { ACCOUNT } from '../appwrite/client';
import type { Role } from '../models/role';

export type { Role };

// Keep in sync with functions/set-role-and-permissions/src/admin-users.js's VALID_ROLES.
const ROLE_LABELS: readonly Role[] = ['admin', 'operator'];

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  operator: '/organizer',
};

const LAST_ACTIVITY_STORAGE_KEY = 'givio:lastActivityAt';
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const SESSION_RENEW_INTERVAL_MS = 30 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly account = inject(ACCOUNT);
  private readonly _currentUser = signal<Models.User<Models.Preferences> | null>(null);
  // Initialized from localStorage (not Date.now()) so idle expiry survives a page reload —
  // see recordActivity()'s doc comment for why restoreSession() must never touch this.
  private readonly _lastActivityAt = signal<number>(
    Number(localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY)) || Date.now(),
  );
  private lastRenewedAt = 0;

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
    this.recordActivity();
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
        console.error('AuthService.restoreSession: unexpected error, treating as logged out', error);
      }
    }
    // Deliberately does NOT call recordActivity() — this runs on every app bootstrap
    // (including a plain page reload), so resetting the idle clock here would let a reload
    // silently erase an already-expired idle window. Leaving the persisted (possibly stale)
    // value untouched is what makes isSessionExpired() correct immediately after a reload.
  }

  /** Marks "now" as the last known activity, persisted so a page reload doesn't reset it. */
  recordActivity(): void {
    const now = Date.now();
    this._lastActivityAt.set(now);
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
  }

  isSessionExpired(): boolean {
    return Date.now() - this._lastActivityAt() > IDLE_TIMEOUT_MS;
  }

  /**
   * Attaches global click/keydown listeners (throttled to once a minute) so in-page activity
   * that never triggers a navigation — e.g. filling out a long form — still counts toward the
   * idle window. Call once at app bootstrap.
   */
  registerActivityListeners(): void {
    const onActivity = () => {
      if (Date.now() - this._lastActivityAt() >= 60_000) {
        this.recordActivity();
      }
    };
    window.addEventListener('click', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });
  }

  /**
   * Extends the session's expiry via Appwrite's own `updateSession`, throttled to at most
   * once per SESSION_RENEW_INTERVAL_MS — Appwrite documents this endpoint as rate-limited if
   * called too often. Swallows failures the same way restoreSession()/logout() do, since a
   * renewal failure shouldn't block navigation.
   */
  async maybeRenewSession(): Promise<void> {
    if (Date.now() - this.lastRenewedAt < SESSION_RENEW_INTERVAL_MS) {
      return;
    }
    try {
      await this.account.updateSession({ sessionId: 'current' });
      this.lastRenewedAt = Date.now();
    } catch {
      /* renewal failures are non-fatal — the session simply won't be extended this cycle */
    }
  }
}
