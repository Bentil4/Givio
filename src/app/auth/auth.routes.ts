import { Routes } from '@angular/router';
import { redirectIfAuthenticatedGuard } from '../core/guards/role.guard';
import { signupEntryGuard } from '../core/guards/tenant.guard';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    canActivate: [redirectIfAuthenticatedGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'auth/signup',
    canActivate: [signupEntryGuard],
    loadComponent: () =>
      import('../feature/pages/company/signup-wizard/signup-wizard').then((m) => m.SignupWizard),
    title: 'Register your company',
  },
];
