import { Routes } from '@angular/router';
import { roleGuard, sessionExpiryGuard } from '../../../core/guards/role.guard';

export const ORGANIZER_ROUTES: Routes = [
  {
    path: 'organizer',
    canActivate: [sessionExpiryGuard, roleGuard(['operator'])],
    canActivateChild: [sessionExpiryGuard, roleGuard(['operator'])],
    loadComponent: () =>
      import('./organizer-layout/organizer-layout').then((m) => m.OrganizerLayout),
    title: 'Organizer',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./operator-dashboard/operator-dashboard').then((m) => m.OperatorDashboard),
        title: 'Overview',
      },
      {
        path: 'events',
        loadComponent: () => import('./event-select/event-select').then((m) => m.EventSelect),
        title: 'Select an event',
      },
      {
        path: 'entry',
        loadComponent: () =>
          import('./donation-entry/donation-entry').then((m) => m.DonationEntry),
        title: 'Record a donation',
      },
      {
        // Phone-sized entry for roaming collectors — a different ergonomic (keypad,
        // one-column), not just a narrower breakpoint of the tablet form.
        path: 'entry/phone',
        loadComponent: () => import('./mobile-entry/mobile-entry').then((m) => m.MobileEntry),
        title: 'Record a donation',
      },
      {
        path: 'donations',
        loadComponent: () =>
          import('./operator-donations/operator-donations').then((m) => m.OperatorDonations),
        title: "Today's donations",
      },
    ],
  },
];
