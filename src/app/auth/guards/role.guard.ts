import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore, ROLE_HOME, Role } from '../../data/stores/auth-store';

export const authGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);
  return authStore.isAuthenticated() || router.createUrlTree(['/login']);
};

export function roleGuard(allowedRoles: readonly Role[]): CanActivateFn {
  return () => {
    const authStore = inject(AuthStore);
    const router = inject(Router);
    const role = authStore.role();
    return (role !== null && allowedRoles.includes(role)) || router.createUrlTree(['/login']);
  };
}

/**
 * Applied to the login route: an already-authenticated user is sent straight to their
 * own dashboard instead of being shown the login form again.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);
  const role = authStore.role();
  return role === null || router.createUrlTree([ROLE_HOME[role]]);
};
