import { Routes } from '@angular/router';
import { AUTH_ROUTES } from './auth/auth.routes';
import { ADMIN_ROUTES } from './feature/pages/admin/admin.routes';
import { ORGANIZER_ROUTES } from './feature/pages/organizer/organizer.routes';
import { FAMILY_ROUTES } from './feature/pages/family/family.routes';
import { COMPANY_ROUTES } from './feature/pages/company/company.routes';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  ...AUTH_ROUTES,
  ...ADMIN_ROUTES,
  ...ORGANIZER_ROUTES,
  ...FAMILY_ROUTES,
  ...COMPANY_ROUTES,
];
