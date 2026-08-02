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
 * Applied to the login route: an already-authenticated user is sent straight to their
 * own dashboard instead of being shown the login form again.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const role = authService.role();
  return role === null || router.createUrlTree([ROLE_HOME[role]]);
};
