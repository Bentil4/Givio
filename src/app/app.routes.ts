import { Routes } from '@angular/router';
import { Login } from './auth/pages/login/login';
import { AdminLayout } from './feature/pages/admin/admin-layout/admin-layout';
import { UserLayout } from './feature/pages/user/user-layout/user-layout';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: Login,
  },
  {
    path: 'dashboard',
    component: AdminLayout,
    title: 'Admin layout',
  },
  {
    path: 'user-dashboard',
    component: UserLayout,
    title: 'User layout',
  },
];
