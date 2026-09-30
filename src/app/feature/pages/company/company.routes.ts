import { Routes } from '@angular/router';
import { sessionExpiryGuard } from '../../../core/guards/role.guard';
import { approvedCompanyMatch, pendingCompanyMatch } from '../../../core/guards/tenant.guard';

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
];

export const COMPANY_ROUTES: Routes = [
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
      { path: '**', redirectTo: '' },
    ],
  },
];
