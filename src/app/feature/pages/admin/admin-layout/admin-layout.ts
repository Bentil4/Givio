import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { INavbarItem, IUserProfile } from '../../../../auth/model/user.model';
import { Sidebar } from '../../../components/sidebar/sidebar';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, Sidebar],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
  // private authService = inject(AuthService);
  private router = inject(Router);

  public isSidebarCollapsed = signal(false);
  public userProfile: IUserProfile[] = [];

  public navItems: INavbarItem[] = [
    { name: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { name: 'Events', icon: 'event', route: '/events' },
    { name: 'Donation', icon: 'volunteer_activism', route: '/donation' },
    { name: 'Report', icon: 'bar_chart', route: '/report' },
    { name: 'Settings', icon: 'settings', route: '/settings' },
  ];

  public toggleSidebar(): void {
    this.isSidebarCollapsed.update((collapsed) => !collapsed);
  }
}
