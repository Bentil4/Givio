import { Routes } from '@angular/router';

// Family access has no Appwrite account — an event code is the whole credential — so
// these routes sit outside both guarded subtrees (sessionExpiryGuard/roleGuard must not run here).
export const FAMILY_ROUTES: Routes = [
  {
    path: 'family',
    loadComponent: () => import('./family-code/family-code').then((m) => m.FamilyCode),
    title: 'Enter your event code',
  },
  {
    path: 'family/:code',
    loadComponent: () => import('./family-live/family-live').then((m) => m.FamilyLive),
    title: 'Live giving',
  },
];
