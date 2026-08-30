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
    path: 'entry',
    loadComponent: () =>
      import('./feature/pages/organizer/donation-entry/donation-entry').then((m) => m.DonationEntry),
    title: 'Record a donation',
  },
];

/** Merge into the 'dashboard' (admin) route's children array. */
export const adminChildAdditions: Routes = [
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
];

/**
 * Add at the TOP LEVEL of the routes array, as a sibling of 'login'.
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
