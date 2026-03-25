import { Routes } from '@angular/router';
import { Login } from './auth/pages/login/login';
import { AdminDashboard } from './feature/pages/dashboard/admin-dashboard/admin-dashboard';
import { UserDashboard } from './feature/pages/dashboard/user-dashboard/user-dashboard';

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
    component: AdminDashboard,
    title: 'Admin Dashboard',
  },
  {
    path: 'user-dashboard',
    component: UserDashboard,
    title: 'User Dashboard',
  },
];
