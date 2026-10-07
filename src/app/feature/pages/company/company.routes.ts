import { Routes } from '@angular/router';
import { sessionExpiryGuard } from '../../../core/guards/role.guard';
import { approvedCompanyMatch, pendingCompanyMatch } from '../../../core/guards/tenant.guard';
import { superOrganizerMatch } from '../../../core/guards/super-organizer.guard';
import type { BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb';

/**
 * The approved Organizer tier's pages. New /company/* screens (team, audit, reports, support…)
 * are added here and get a matching nav item in CompanyLayout.navItems — they are unreachable
 * for a pending/rejected/suspended tenant because this whole list only exists under
 * approvedCompanyMatch.
 */
export const COMPANY_CHILD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./company-dashboard/company-dashboard').then((m) => m.CompanyDashboard),
    title: 'Company dashboard',
  },
  {
    path: 'events',
    loadComponent: () => import('./company-events/company-events').then((m) => m.CompanyEvents),
    title: 'Events',
  },
  {
    path: 'events/:id',
    loadComponent: () =>
      import('./company-event-detail/company-event-detail').then((m) => m.CompanyEventDetail),
    title: 'Event detail',
    data: {
      breadcrumb: [{ label: 'Events', path: '/company/events' }] satisfies BreadcrumbItem[],
    },
  },
  {
    path: 'donations',
    loadComponent: () =>
      import('./company-donations/company-donations').then((m) => m.CompanyDonations),
    title: 'Donations',
  },
  {
    path: 'team',
    loadComponent: () => import('./company-team/company-team').then((m) => m.CompanyTeam),
    title: 'Team',
  },
  {
    path: 'support',
    loadComponent: () => import('./company-support/company-support').then((m) => m.CompanySupport),
    title: 'Contact Admin',
  },
  {
    path: 'reports',
    canMatch: [superOrganizerMatch],
    loadComponent: () => import('./company-reports/company-reports').then((m) => m.CompanyReports),
    title: 'Settlement reports',
  },
  {
    path: 'audit',
    canMatch: [superOrganizerMatch],
    loadComponent: () => import('./company-audit/company-audit').then((m) => m.CompanyAudit),
    title: 'Activity log',
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('../settings/settings-page/settings-page').then((m) => m.SettingsPage),
    title: 'Settings',
  },
];

export const COMPANY_ROUTES: Routes = [
  {
    // Deliberately unguarded and listed first (FR-20): a suspended tenant's Organizer can't sign
    // in, and both /company matchers below would send an anonymous visitor to /login.
    path: 'company/dispute',
    loadComponent: () =>
      import('./company-support/company-dispute/company-dispute').then((m) => m.CompanyDispute),
    title: 'Dispute a suspension',
  },
  {
    path: 'company',
    canMatch: [approvedCompanyMatch],
    canActivate: [sessionExpiryGuard],
    canActivateChild: [sessionExpiryGuard],
    loadComponent: () => import('./company-layout/company-layout').then((m) => m.CompanyLayout),
    title: 'Company',
    children: COMPANY_CHILD_ROUTES,
  },
  {
    // Not approved (pending/rejected/suspended): the full-page shell is the only thing under
    // /company — no layout, no sidebar, and every deeper URL collapses back onto it.
    path: 'company',
    canMatch: [pendingCompanyMatch],
    canActivate: [sessionExpiryGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./pending-shell/pending-shell').then((m) => m.PendingShell),
        title: 'Application status',
      },
      {
        path: 'support',
        loadComponent: () =>
          import('./company-support/pending-support').then((m) => m.PendingSupport),
        title: 'Contact Admin',
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
