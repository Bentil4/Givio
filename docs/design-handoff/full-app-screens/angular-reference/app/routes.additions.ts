/**
 * Route entries to MERGE into src/app/app.routes.ts. Not a drop-in replacement —
 * app.routes.ts already defines '', 'login', 'dashboard' and 'organizer'.
 *
 * Three things worth noting:
 *   1. The operator segment stays 'organizer'. The repo's roleGuard already maps that
 *      subtree to roleGuard(['operator']); renaming the URL would break existing links
 *      and the route spec for no user-visible gain.
 *   2. 'family' sits OUTSIDE both guarded subtrees. Family members have no Appwrite
 *      account — an event code is the whole credential — so sessionExpiryGuard and
 *      roleGuard must not run on it. Add an eventCodeGuard instead.
 *   3. Titles follow the existing convention (a plain human string per route).
 */
import { Routes } from '@angular/router';

/** Merge into the 'organizer' route's children array. */
export const organizerChildAdditions: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./feature/pages/organizer/event-select/event-select').then((m) => m.EventSelect),
    title: 'Select an event',
  },
  {
    path: 'entry',
    loadComponent: () =>
      import('./feature/pages/organizer/donation-entry/donation-entry').then((m) => m.DonationEntry),
    title: 'Record a donation',
  },
  {
    // Phone-sized entry for roaming collectors. A separate route rather than a breakpoint:
    // it is a different ergonomic (keypad, one-column), not a narrower tablet form. Route
    // to it from the shell when the viewport is under ~520px, or let operators pick it.
    path: 'entry/phone',
    loadComponent: () =>
      import('./feature/pages/organizer/mobile-entry/mobile-entry').then((m) => m.MobileEntry),
    title: 'Record a donation',
  },
  {
    path: 'donations',
    loadComponent: () =>
      import('./feature/pages/organizer/operator-donations/operator-donations').then((m) => m.OperatorDonations),
    title: "Today's donations",
  },
];

/** Merge into the 'dashboard' (admin) route's children array. */
export const adminChildAdditions: Routes = [
  {
    path: 'events',
    loadComponent: () =>
      import('./feature/pages/admin/admin-events/admin-events').then((m) => m.AdminEvents),
    title: 'Events',
  },
  {
    path: 'events/:id',
    loadComponent: () =>
      import('./feature/pages/admin/admin-event-detail/admin-event-detail').then((m) => m.AdminEventDetail),
    title: 'Event detail',
  },
  {
    path: 'users',
    loadComponent: () =>
      import('./feature/pages/admin/admin-users/admin-users').then((m) => m.AdminUsers),
    title: 'Users',
  },
  {
    path: 'donations',
    loadComponent: () =>
      import('./feature/pages/admin/admin-donations/admin-donations').then((m) => m.AdminDonations),
    title: 'Donation oversight',
  },
  {
    path: 'donations/conflicts',
    loadComponent: () =>
      import('./feature/pages/admin/admin-conflicts/admin-conflicts').then((m) => m.AdminConflicts),
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
      import('./feature/pages/admin/admin-reports/admin-reports').then((m) => m.AdminReports),
    title: 'Reports',
  },
  {
    path: 'audit',
    loadComponent: () =>
      import('./feature/pages/admin/admin-audit/admin-audit').then((m) => m.AdminAudit),
    title: 'Audit trail',
  },
];

/**
 * Replaces the existing 'login' route's component (the repo already declares the path).
 * Role branching happens inside Login, on the server-issued role.
 */
export const loginRoute: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/pages/login/login').then((m) => m.Login),
    title: 'Sign in',
  },
];

/**
 * Add at the TOP LEVEL of the routes array, as a sibling of 'login'.
 *
 * eventCodeGuard should: read the :code param, resolve it to an event, and redirect to
 * '/family' with an inline error when the code is unknown, the event is closed past its
 * 90-day export window, or the device is inside the 10-minute wrong-code cooldown.
 */
export const familyRoutes: Routes = [
  {
    path: 'family',
    loadComponent: () =>
      import('./feature/pages/family/family-code/family-code').then((m) => m.FamilyCode),
    title: 'Enter your event code',
  },
  {
    path: 'family/:code',
    // canActivate: [eventCodeGuard],
    loadComponent: () =>
      import('./feature/pages/family/family-live/family-live').then((m) => m.FamilyLive),
    title: 'Live giving',
  },
];

/**
 * SessionExpired is a component, not a route. Mount it once in the authenticated shell
 * (the same layout that hosts the sidebar) so a single instance covers every page:
 *
 *   <app-session-expired
 *     [open]="session.expired()"
 *     [queuedCount]="offlineQueue.pending().length"
 *     (signIn)="router.navigate(['/login'])" />
 */
