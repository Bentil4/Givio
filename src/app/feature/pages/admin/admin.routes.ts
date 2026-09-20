import { Routes } from '@angular/router';
import { roleGuard, sessionExpiryGuard } from '../../../core/guards/role.guard';
import type { BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb';

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
        path: 'events',
        loadComponent: () => import('./admin-events/admin-events').then((m) => m.AdminEvents),
        title: 'Events',
      },
      {
        path: 'events/:id/edit',
        loadComponent: () => import('./edit-event/edit-event').then((m) => m.EditEvent),
        title: 'Edit Event',
        data: {
          breadcrumb: [{ label: 'Events', path: '/dashboard/events' }] satisfies BreadcrumbItem[],
        },
      },
      {
        // Must stay after 'events/:id/edit' — a 2-segment param route would otherwise
        // shadow a literal 2-segment path (Angular matches children in array order). Not a
        // real risk here since 'events/:id/edit' is 3 segments, but keeping the more
        // specific route first is the safer convention.
        path: 'events/:id',
        loadComponent: () =>
          import('./admin-event-detail/admin-event-detail').then((m) => m.AdminEventDetail),
        title: 'Event detail',
        data: {
          breadcrumb: [{ label: 'Events', path: '/dashboard/events' }] satisfies BreadcrumbItem[],
        },
      },
      {
        path: 'donations',
        loadComponent: () =>
          import('./admin-donations/admin-donations').then((m) => m.AdminDonations),
        title: 'Donation oversight',
      },
      {
        path: 'donations/conflicts',
        loadComponent: () =>
          import('./admin-conflicts/admin-conflicts').then((m) => m.AdminConflicts),
        title: 'Resolve sync conflicts',
        data: {
          breadcrumb: [
            { label: 'Donation oversight', path: '/dashboard/donations' },
          ] satisfies BreadcrumbItem[],
        },
      },
      {
        path: 'donations/deleted',
        loadComponent: () => import('./admin-trash/admin-trash').then((m) => m.AdminTrash),
        title: 'Deleted donations',
        data: {
          breadcrumb: [
            { label: 'Donation oversight', path: '/dashboard/donations' },
          ] satisfies BreadcrumbItem[],
        },
      },
      {
        path: 'reports',
        loadComponent: () => import('./admin-reports/admin-reports').then((m) => m.AdminReports),
        title: 'Reports',
      },
      {
        path: 'audit',
        loadComponent: () => import('./admin-audit/admin-audit').then((m) => m.AdminAudit),
        title: 'Audit trail',
      },
    ],
  },
];
