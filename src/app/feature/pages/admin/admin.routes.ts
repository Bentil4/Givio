import { Routes } from '@angular/router';
import { roleGuard, sessionExpiryGuard, superAdminGuard } from '../../../core/guards/role.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'dashboard',
    // canActivateChild is required alongside canActivate: Angular's default
    // runGuardsAndResolvers doesn't re-check a parent route's canActivate when only a child
    // segment changes (e.g. /dashboard -> /dashboard/users), so without this, idle expiry
    // would only ever be checked once per visit to this subtree.
    canActivate: [sessionExpiryGuard, roleGuard(['admin'])],
    canActivateChild: [sessionExpiryGuard, roleGuard(['admin'])],
    loadComponent: () => import('./admin-layout/admin-layout').then((m) => m.AdminLayout),
    title: 'Admin',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./admin-dashboard/admin-dashboard').then((m) => m.AdminDashboard),
        title: 'Admin Dashboard',
      },
      {
        path: 'users',
        loadComponent: () => import('./admin-users/admin-users').then((m) => m.AdminUsers),
        title: 'Users',
      },
      {
        path: 'admins',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./admin-admins/admin-admins').then((m) => m.AdminAdmins),
        title: 'Admin accounts',
      },
      {
        path: 'approvals',
        loadComponent: () =>
          import('./admin-approvals/admin-approvals').then((m) => m.AdminApprovals),
        title: 'Approvals',
      },
      {
        path: 'companies',
        loadComponent: () => import('./admin-tenants/admin-tenants').then((m) => m.AdminTenants),
        title: 'Companies',
      },
      {
        path: 'audit',
        loadComponent: () => import('./admin-audit/admin-audit').then((m) => m.AdminAudit),
        title: 'Audit trail',
      },
      // AD-12 (amended 2026-10-07) removed the Events, Donations and Reports pages; an old
      // bookmark to one of them lands on the overview instead of a dead end.
      { path: '**', redirectTo: '' },
    ],
  },
];
