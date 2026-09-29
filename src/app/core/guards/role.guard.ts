import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, ROLE_HOME, Role } from '../../data/services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.isAuthenticated() || router.createUrlTree(['/login']);
};

export function roleGuard(allowedRoles: readonly Role[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const role = authService.role();
    return (role !== null && allowedRoles.includes(role)) || router.createUrlTree(['/login']);
  };
}

/**
 * Layered on top of roleGuard(['admin']) for the Super-Admin-only screen (AD-11) — an ordinary
 * Admin is bounced back to their own dashboard rather than to /login, since they're signed in.
 */
export const superAdminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.isSuperAdmin() || router.createUrlTree([ROLE_HOME.admin]);
};

/**
 * Applied to the login route: an already-authenticated user is sent straight to their
 * own dashboard instead of being shown the login form again.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const role = authService.role();
  return role === null || router.createUrlTree([ROLE_HOME[role]]);
};

/**
 * Enforces the 8-hour idle timeout (FR-SEC-005) — Appwrite has no native inactivity
 * concept, so this is the client-side enforcement point, checked on every guarded
 * navigation. An unauthenticated caller passes through untouched; authGuard/roleGuard
 * elsewhere handle that case.
 */
export const sessionExpiryGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }

  if (authService.isSessionExpired()) {
    await authService.logout();
    return router.createUrlTree(['/login']);
  }

  authService.recordActivity();
  void authService.maybeRenewSession();
  return true;
};
