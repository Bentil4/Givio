import { Routes } from '@angular/router';
import { redirectIfAuthenticatedGuard, roleGuard } from './auth/guards/role.guard';

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
    canActivate: [roleGuard(['admin'])],
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
    canActivate: [roleGuard(['operator'])],
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
