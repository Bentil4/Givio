import { Routes } from '@angular/router';
import { Login } from './auth/pages/login/login';
import { AdminLayout } from './feature/pages/admin/admin-layout/admin-layout';
import { UserLayout } from './feature/pages/user/user-layout/user-layout';
import { AdminDashboard } from './feature/pages/admin/admin-dashboard/admin-dashboard';

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
    path: '',
    component: AdminLayout,
    title: 'Admin layout',
    children: [
      {
        path: 'admin-dashboard',
        component: AdminDashboard,
        title: 'Admin Dashboard',
      },
    ],
  },
  {
    path: 'user-dashboard',
    component: UserLayout,
    title: 'User layout',
  },
];
