import { Routes } from '@angular/router';
import { redirectIfAuthenticatedGuard } from '../core/guards/role.guard';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    canActivate: [redirectIfAuthenticatedGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
];
