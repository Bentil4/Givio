import { TestBed } from '@angular/core/testing';
import { AppwriteException } from 'appwrite';
import { AuthService } from './auth.service';
import { ACCOUNT } from '../appwrite/client';

describe('AuthService', () => {
  let store: AuthService;
  let account: {
    deleteSession: ReturnType<typeof vi.fn>;
    createEmailPasswordSession: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    updateSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    account = {
      deleteSession: vi.fn(),
      createEmailPasswordSession: vi.fn(),
      get: vi.fn(),
      updateSession: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: ACCOUNT, useValue: account }],
    });
    store = TestBed.inject(AuthService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no current user and no role', () => {
    expect(store.currentUser()).toBeNull();
    expect(store.role()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  describe('login', () => {
    it('creates a session and populates currentUser/role on success', async () => {
      account.deleteSession.mockRejectedValueOnce(new Error('no session'));
      account.createEmailPasswordSession.mockResolvedValueOnce({});
      account.get.mockResolvedValueOnce({ labels: ['admin'] });

      await store.login('admin@givio.test', 'correct-password');

      expect(account.createEmailPasswordSession).toHaveBeenCalledWith({
        email: 'admin@givio.test',
        password: 'correct-password',
      });
      expect(store.role()).toBe('admin');
      expect(store.isAuthenticated()).toBe(true);
    });

    it('derives the operator role from an operator label', async () => {
      account.deleteSession.mockResolvedValueOnce({});
      account.createEmailPasswordSession.mockResolvedValueOnce({});
      account.get.mockResolvedValueOnce({ labels: ['operator'] });

      await store.login('op@givio.test', 'correct-password');

      expect(store.role()).toBe('operator');
    });

    it('propagates a failure on invalid credentials without setting currentUser', async () => {
      account.deleteSession.mockRejectedValueOnce(new Error('no session'));
      account.createEmailPasswordSession.mockRejectedValueOnce(
        new AppwriteException('Invalid credentials', 401, 'user_invalid_credentials'),
      );

      await expect(store.login('nobody@givio.test', 'wrong')).rejects.toThrow();
      expect(store.currentUser()).toBeNull();
    });

    it('has no role when the user has no admin/operator label', async () => {
      account.deleteSession.mockResolvedValueOnce({});
      account.createEmailPasswordSession.mockResolvedValueOnce({});
      account.get.mockResolvedValueOnce({ labels: [] });

      await store.login('nolabel@givio.test', 'correct-password');

      expect(store.role()).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears the session and currentUser', async () => {
      account.deleteSession.mockResolvedValueOnce({});
      account.createEmailPasswordSession.mockResolvedValueOnce({});
      account.get.mockResolvedValueOnce({ labels: ['admin'] });
      await store.login('admin@givio.test', 'correct-password');

      account.deleteSession.mockResolvedValueOnce({});
      await store.logout();

      expect(account.deleteSession).toHaveBeenLastCalledWith({ sessionId: 'current' });
      expect(store.currentUser()).toBeNull();
      expect(store.isAuthenticated()).toBe(false);
    });

    it('still resolves and clears currentUser even if deleteSession fails, so callers can always navigate away', async () => {
      account.deleteSession.mockResolvedValueOnce({});
      account.createEmailPasswordSession.mockResolvedValueOnce({});
      account.get.mockResolvedValueOnce({ labels: ['admin'] });
      await store.login('admin@givio.test', 'correct-password');

      account.deleteSession.mockRejectedValueOnce(new Error('network error'));
      await expect(store.logout()).resolves.toBeUndefined();

      expect(store.currentUser()).toBeNull();
      expect(store.isAuthenticated()).toBe(false);
    });
  });

  describe('restoreSession', () => {
    it('restores currentUser when a valid session exists', async () => {
      account.get.mockResolvedValueOnce({ labels: ['operator'] });

      await store.restoreSession();

      expect(store.role()).toBe('operator');
    });

    it('sets currentUser to null on a 401 (no session)', async () => {
      account.get.mockRejectedValueOnce(new AppwriteException('Unauthorized', 401, 'general_unauthorized_scope'));

      await store.restoreSession();

      expect(store.currentUser()).toBeNull();
    });

    it('still resolves and treats an unexpected error as logged out, so app bootstrap never blocks', async () => {
      account.get.mockRejectedValueOnce(new AppwriteException('Service unavailable', 503, 'general_service_disabled'));

      await expect(store.restoreSession()).resolves.toBeUndefined();
      expect(store.currentUser()).toBeNull();
    });

    it('does NOT reset lastActivityAt — a stale persisted timestamp stays expired even after a successful restoreSession()', async () => {
      const nineHoursAgo = Date.parse('2026-08-01T00:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(nineHoursAgo);
      localStorage.setItem('givio:lastActivityAt', String(nineHoursAgo));
      // TestBed caches the providedIn:'root' singleton from the outer beforeEach, so a plain
      // re-inject would return that already-constructed instance. Reset the module first to
      // force a fresh AuthService that reads the persisted value set just above.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: ACCOUNT, useValue: account }] });
      store = TestBed.inject(AuthService);

      vi.setSystemTime(nineHoursAgo + 9 * 60 * 60 * 1000);
      account.get.mockResolvedValueOnce({ labels: ['admin'] });

      await store.restoreSession();

      expect(store.isSessionExpired()).toBe(true);
    });
  });

  describe('recordActivity', () => {
    it('updates the persisted timestamp', () => {
      const now = Date.parse('2026-08-02T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      store.recordActivity();

      expect(localStorage.getItem('givio:lastActivityAt')).toBe(String(now));
    });
  });

  describe('isSessionExpired', () => {
    it('is false right after login()', async () => {
      account.deleteSession.mockRejectedValueOnce(new Error('no session'));
      account.createEmailPasswordSession.mockResolvedValueOnce({});
      account.get.mockResolvedValueOnce({ labels: ['admin'] });

      await store.login('admin@givio.test', 'correct-password');

      expect(store.isSessionExpired()).toBe(false);
    });

    it('is true once 8 hours have passed since the last recorded activity', async () => {
      const now = Date.parse('2026-08-02T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      account.deleteSession.mockRejectedValueOnce(new Error('no session'));
      account.createEmailPasswordSession.mockResolvedValueOnce({});
      account.get.mockResolvedValueOnce({ labels: ['admin'] });
      await store.login('admin@givio.test', 'correct-password');

      vi.setSystemTime(now + 8 * 60 * 60 * 1000 + 1);

      expect(store.isSessionExpired()).toBe(true);
    });
  });

  describe('maybeRenewSession', () => {
    it('calls account.updateSession when the renew interval has elapsed', async () => {
      const now = Date.parse('2026-08-02T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      account.updateSession.mockResolvedValueOnce({});

      await store.maybeRenewSession();

      expect(account.updateSession).toHaveBeenCalledWith({ sessionId: 'current' });
    });

    it('does not call account.updateSession again immediately after (throttled)', async () => {
      const now = Date.parse('2026-08-02T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      account.updateSession.mockResolvedValueOnce({});
      await store.maybeRenewSession();

      vi.setSystemTime(now + 5 * 60 * 1000);
      await store.maybeRenewSession();

      expect(account.updateSession).toHaveBeenCalledTimes(1);
    });

    it('calls account.updateSession again once the renew interval has elapsed a second time', async () => {
      const now = Date.parse('2026-08-02T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      account.updateSession.mockResolvedValue({});
      await store.maybeRenewSession();

      vi.setSystemTime(now + 31 * 60 * 1000);
      await store.maybeRenewSession();

      expect(account.updateSession).toHaveBeenCalledTimes(2);
    });

    it('does not throw when account.updateSession rejects', async () => {
      account.updateSession.mockRejectedValueOnce(new Error('rate limited'));

      await expect(store.maybeRenewSession()).resolves.toBeUndefined();
    });
  });

  describe('registerActivityListeners', () => {
    it('does NOT revive an already idle-expired session on a plain click with no navigation', async () => {
      const now = Date.parse('2026-08-02T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      account.deleteSession.mockRejectedValueOnce(new Error('no session'));
      account.createEmailPasswordSession.mockResolvedValueOnce({});
      account.get.mockResolvedValueOnce({ labels: ['admin'] });
      await store.login('admin@givio.test', 'correct-password');
      store.registerActivityListeners();

      vi.setSystemTime(now + 9 * 60 * 60 * 1000);
      expect(store.isSessionExpired()).toBe(true);
      window.dispatchEvent(new MouseEvent('click'));

      expect(store.isSessionExpired()).toBe(true);
    });

    it('still records activity on click when the session is not yet expired', async () => {
      const now = Date.parse('2026-08-02T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      account.deleteSession.mockRejectedValueOnce(new Error('no session'));
      account.createEmailPasswordSession.mockResolvedValueOnce({});
      account.get.mockResolvedValueOnce({ labels: ['admin'] });
      await store.login('admin@givio.test', 'correct-password');
      store.registerActivityListeners();

      vi.setSystemTime(now + 5 * 60 * 60 * 1000);
      window.dispatchEvent(new MouseEvent('click'));
      // The click should have moved lastActivityAt forward to the 5h mark, so 7h59m later
      // (< 8h from the click) must still be unexpired — it would be expired if measured
      // from the original login time instead.
      vi.setSystemTime(now + 5 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000 - 1);

      expect(store.isSessionExpired()).toBe(false);
    });
  });
});
