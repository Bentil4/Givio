import { TestBed } from '@angular/core/testing';
import { UrlTree } from '@angular/router';
import { ACCOUNT } from '../../data/appwrite/client';
import { AuthService } from '../../data/services/auth.service';
import {
  authGuard,
  redirectIfAuthenticatedGuard,
  roleGuard,
  sessionExpiryGuard,
} from './role.guard';

describe('role.guard', () => {
  let account: {
    get: ReturnType<typeof vi.fn>;
    deleteSession: ReturnType<typeof vi.fn>;
    updateSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    account = { get: vi.fn(), deleteSession: vi.fn(), updateSession: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: ACCOUNT, useValue: account }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function loginAs(labels: string[]) {
    const authService = TestBed.inject(AuthService);
    account.get.mockResolvedValueOnce({ labels });
    await authService.restoreSession();
  }

  describe('authGuard', () => {
    it('allows an authenticated user through', async () => {
      await loginAs(['admin']);
      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as never, { url: '/admin' } as never),
      );
      expect(result).toBe(true);
    });

    it('redirects an unauthenticated user to /login', () => {
      const result = TestBed.runInInjectionContext(() =>
        authGuard({} as never, { url: '/admin' } as never),
      );
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/login');
    });
  });

  describe('roleGuard', () => {
    it('allows a user whose role is in the allowed list', async () => {
      await loginAs(['admin']);
      const guard = roleGuard(['admin']);
      const result = TestBed.runInInjectionContext(() => guard({} as never, { url: '/admin' } as never));
      expect(result).toBe(true);
    });

    it('denies a user whose role is not in the allowed list, even via a direct URL', async () => {
      await loginAs(['operator']);
      const guard = roleGuard(['admin']);
      const result = TestBed.runInInjectionContext(() => guard({} as never, { url: '/admin' } as never));
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/login');
    });

    it('denies an unauthenticated caller', () => {
      const guard = roleGuard(['admin']);
      const result = TestBed.runInInjectionContext(() => guard({} as never, { url: '/admin' } as never));
      expect(result).toBeInstanceOf(UrlTree);
    });
  });

  describe('redirectIfAuthenticatedGuard', () => {
    it('lets an unauthenticated user reach the login page', () => {
      const result = TestBed.runInInjectionContext(() =>
        redirectIfAuthenticatedGuard({} as never, { url: '/login' } as never),
      );
      expect(result).toBe(true);
    });

    it('redirects an already-authenticated admin to /admin instead of showing login again', async () => {
      await loginAs(['admin']);
      const result = TestBed.runInInjectionContext(() =>
        redirectIfAuthenticatedGuard({} as never, { url: '/login' } as never),
      );
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/admin');
    });

    it('redirects an already-authenticated operator to /organizer', async () => {
      await loginAs(['operator']);
      const result = TestBed.runInInjectionContext(() =>
        redirectIfAuthenticatedGuard({} as never, { url: '/login' } as never),
      );
      expect((result as UrlTree).toString()).toBe('/organizer');
    });
  });

  describe('sessionExpiryGuard', () => {
    it('allows an unauthenticated caller through', async () => {
      const result = await TestBed.runInInjectionContext(() =>
        sessionExpiryGuard({} as never, { url: '/admin' } as never),
      );
      expect(result).toBe(true);
    });

    it('allows an authenticated, non-idle caller through and records activity', async () => {
      account.updateSession.mockResolvedValueOnce({});
      await loginAs(['admin']);
      const authService = TestBed.inject(AuthService);
      const recordActivitySpy = vi.spyOn(authService, 'recordActivity');

      const result = await TestBed.runInInjectionContext(() =>
        sessionExpiryGuard({} as never, { url: '/admin' } as never),
      );

      expect(result).toBe(true);
      expect(recordActivitySpy).toHaveBeenCalled();
    });

    it('logs out and redirects to /login for an idle-expired authenticated caller', async () => {
      const now = Date.parse('2026-08-02T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      await loginAs(['admin']);
      account.deleteSession.mockResolvedValueOnce({});

      vi.setSystemTime(now + 8 * 60 * 60 * 1000 + 1);

      const result = await TestBed.runInInjectionContext(() =>
        sessionExpiryGuard({} as never, { url: '/admin' } as never),
      );

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/login');
      expect(account.deleteSession).toHaveBeenCalledWith({ sessionId: 'current' });
    });
  });
});
