import { TestBed } from '@angular/core/testing';
import { AppwriteException } from 'appwrite';
import { AuthStore } from './auth-store';
import { ACCOUNT } from '../appwrite/client';

describe('AuthStore', () => {
  let store: AuthStore;
  let account: {
    deleteSession: ReturnType<typeof vi.fn>;
    createEmailPasswordSession: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    account = {
      deleteSession: vi.fn(),
      createEmailPasswordSession: vi.fn(),
      get: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: ACCOUNT, useValue: account }],
    });
    store = TestBed.inject(AuthStore);
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
  });
});
