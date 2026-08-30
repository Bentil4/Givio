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
    path: 'dashboard',
    // canActivateChild is required alongside canActivate: Angular's default
    // runGuardsAndResolvers doesn't re-check a parent route's canActivate when only a child
    // segment changes (e.g. /dashboard -> /dashboard/users), so without this, idle expiry
    // would only ever be checked once per visit to this subtree.
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
        path: 'users',
        loadComponent: () =>
          import('./feature/pages/admin/admin-users/admin-users').then((m) => m.AdminUsers),
        title: 'Users',
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./feature/pages/admin/admin-events/admin-events').then((m) => m.AdminEvents),
        title: 'Events',
      },
      {
        path: 'events/:id/edit',
        loadComponent: () =>
          import('./feature/pages/admin/edit-event/edit-event').then((m) => m.EditEvent),
        title: 'Edit Event',
      },
      {
        // Must stay after 'events/:id/edit' — a 2-segment param route would otherwise
        // shadow a literal 2-segment path (Angular matches children in array order). Not a
        // real risk here since 'events/:id/edit' is 3 segments, but keeping the more
        // specific route first is the safer convention.
        path: 'events/:id',
        loadComponent: () =>
          import('./feature/pages/admin/admin-event-detail/admin-event-detail').then(
            (m) => m.AdminEventDetail,
          ),
        title: 'Event detail',
      },
      {
        path: 'donations',
        loadComponent: () =>
          import('./feature/pages/admin/admin-donations/admin-donations').then(
            (m) => m.AdminDonations,
          ),
        title: 'Donation oversight',
      },
      {
        path: 'donations/conflicts',
        loadComponent: () =>
          import('./feature/pages/admin/admin-conflicts/admin-conflicts').then(
            (m) => m.AdminConflicts,
          ),
        title: 'Resolve sync conflicts',
      },
      {
        path: 'donations/deleted',
        loadComponent: () =>
          import('./feature/pages/admin/admin-trash/admin-trash').then((m) => m.AdminTrash),
        title: 'Deleted donations',
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./feature/pages/admin/admin-reports/admin-reports').then(
            (m) => m.AdminReports,
          ),
        title: 'Reports',
      },
      {
        path: 'audit',
        loadComponent: () =>
          import('./feature/pages/admin/admin-audit/admin-audit').then((m) => m.AdminAudit),
        title: 'Audit trail',
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
          import('./feature/pages/organizer/operator-dashboard/operator-dashboard').then(
            (m) => m.OperatorDashboard,
          ),
        title: 'Overview',
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./feature/pages/organizer/event-select/event-select').then(
            (m) => m.EventSelect,
          ),
        title: 'Select an event',
      },
      {
        path: 'entry',
        loadComponent: () =>
          import('./feature/pages/organizer/donation-entry/donation-entry').then(
            (m) => m.DonationEntry,
          ),
        title: 'Record a donation',
      },
      {
        // Phone-sized entry for roaming collectors — a different ergonomic (keypad,
        // one-column), not just a narrower breakpoint of the tablet form.
        path: 'entry/phone',
        loadComponent: () =>
          import('./feature/pages/organizer/mobile-entry/mobile-entry').then(
            (m) => m.MobileEntry,
          ),
        title: 'Record a donation',
      },
      {
        path: 'donations',
        loadComponent: () =>
          import('./feature/pages/organizer/operator-donations/operator-donations').then(
            (m) => m.OperatorDonations,
          ),
        title: "Today's donations",
      },
    ],
  },
  // Family access has no Appwrite account — an event code is the whole credential — so
  // it sits outside both guarded subtrees (sessionExpiryGuard/roleGuard must not run here).
  {
    path: 'family',
    loadComponent: () =>
      import('./feature/pages/family/family-code/family-code').then((m) => m.FamilyCode),
    title: 'Enter your event code',
  },
  {
    path: 'family/:code',
    loadComponent: () =>
      import('./feature/pages/family/family-live/family-live').then((m) => m.FamilyLive),
    title: 'Live giving',
  },
];
