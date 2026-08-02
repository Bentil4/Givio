import { TestBed } from '@angular/core/testing';
import { UrlTree } from '@angular/router';
import { ACCOUNT } from '../../data/appwrite/client';
import { AuthService } from '../../data/services/auth.service';
import { authGuard, redirectIfAuthenticatedGuard, roleGuard } from './role.guard';

describe('role.guard', () => {
  let account: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    account = { get: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: ACCOUNT, useValue: account }],
    });
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
});
