import { Injectable, computed, inject, signal } from '@angular/core';
import { AppwriteException, ID, Models } from 'appwrite';
import { ACCOUNT } from '../../core/appwrite/client';
import { SUPER_ADMIN_LABEL, type Role } from '../models/role';
import { purgeCompanyCacheIfAdmin } from '../dexie/company-cache-purge';

export type { Role };

// Keep in sync with functions/set-role-and-permissions/src/admin-users.js's VALID_ROLES.
const ROLE_LABELS: readonly Role[] = ['admin', 'operator'];

export const ROLE_HOME: Record<Role, string> = {
  admin: '/dashboard',
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

  /** UI convenience only — the AD-9 Function independently enforces this gate (FR-26). */
  public readonly isSuperAdmin = computed(() => {
    const labels = this._currentUser()?.labels ?? [];
    return labels.includes('admin') && labels.includes(SUPER_ADMIN_LABEL);
  });

  public readonly isAuthenticated = computed(() => this._currentUser() !== null);

  async login(email: string, password: string): Promise<void> {
    try {
      await this.account.deleteSession({ sessionId: 'current' });
    } catch {
      /* no active session to clear */
    }
    await this.account.createEmailPasswordSession({ email, password });
    await this.refreshCurrentUser();
    this.recordActivity();
  }

  /**
   * Re-reads the signed-in Account, e.g. after Settings changed its name or phone. Also the
   * one step login and restoreSession share, so it is where an Admin's device drops any
   * cached company data (AD-12, amended 2026-10-07).
   */
  async refreshCurrentUser(): Promise<void> {
    const user = await this.account.get();
    this._currentUser.set(user);
    void this.purgeCompanyCache(user);
  }

  /**
   * Housekeeping, not part of signing in: it runs in the background so a slow or failing
   * IndexedDB never delays or fails the sign-in — the next sign-in retries it.
   */
  private async purgeCompanyCache(user: Models.User<Models.Preferences>): Promise<void> {
    try {
      await purgeCompanyCacheIfAdmin(user);
    } catch (error) {
      console.error('AuthService: failed to clear cached company data', error);
    }
  }

  /**
   * Self-signup (Story 6.4): creates a brand-new Account and signs straight into it. The
   * Account carries no Label and no Membership until the Function accepts the application.
   */
  async register(name: string, email: string, password: string): Promise<void> {
    await this.account.create({ userId: ID.unique(), email, password, name });
    await this.login(email, password);
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
      await this.refreshCurrentUser();
    } catch (error) {
      this._currentUser.set(null);
      const isExpectedNoSession = error instanceof AppwriteException && error.code === 401;
      if (!isExpectedNoSession) {
        console.error(
          'AuthService.restoreSession: unexpected error, treating as logged out',
          error,
        );
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
      // An already idle-expired session must stay expired until sessionExpiryGuard catches
      // it on the next navigation and logs out — recording activity here would silently
      // revive it, since this listener never checks isSessionExpired() itself.
      if (this.isSessionExpired()) {
        return;
      }
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
