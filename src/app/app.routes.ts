import { Routes } from '@angular/router';
import {
  redirectIfAuthenticatedGuard,
  roleGuard,
  sessionExpiryGuard,
} from './auth/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    canActivate: [redirectIfAuthenticatedGuard],
    loadComponent: () => import('./auth/pages/login/login').then((m) => m.Login),
  },
  {
    path: 'admin',
    // canActivateChild is required alongside canActivate: Angular's default
    // runGuardsAndResolvers doesn't re-check a parent route's canActivate when only a child
    // segment changes (e.g. /admin -> /admin/settings), so without this, idle expiry would
    // only ever be checked once per visit to this subtree.
    canActivate: [sessionExpiryGuard, roleGuard(['admin'])],
    canActivateChild: [sessionExpiryGuard, roleGuard(['admin'])],
    loadComponent: () =>
      import('./feature/pages/admin/admin-layout/admin-layout').then((m) => m.AdminLayout),
    title: 'Admin',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./feature/pages/admin/admin-dashboard/admin-dashboard').then(
            (m) => m.AdminDashboard,
          ),
        title: 'Admin Dashboard',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./feature/pages/admin/admin-settings/admin-settings').then(
            (m) => m.AdminSettings,
          ),
        title: 'User Management',
      },
    ],
  },
  {
    path: 'organizer',
    canActivate: [sessionExpiryGuard, roleGuard(['operator'])],
    canActivateChild: [sessionExpiryGuard, roleGuard(['operator'])],
    loadComponent: () =>
      import('./feature/pages/organizer/organizer-layout/organizer-layout').then(
        (m) => m.OrganizerLayout,
      ),
    title: 'Organizer',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./feature/pages/organizer/organizer-dashboard/organizer-dashboard').then(
            (m) => m.OrganizerDashboard,
          ),
        title: 'Organizer Dashboard',
      },
    ],
  },
];
