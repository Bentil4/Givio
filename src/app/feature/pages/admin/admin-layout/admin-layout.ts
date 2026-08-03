import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { INavbarItem, IUserProfile } from '../../../../auth/model/user.model';
import { Sidebar } from '../../../components/sidebar/sidebar';
import { AuthService } from '../../../../data/services/auth.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, Sidebar],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  public isSidebarCollapsed = signal(false);
  public userProfile: IUserProfile[] = [];

  public navItems: INavbarItem[] = [
    { name: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { name: 'Events', icon: 'event', route: '/events' },
    { name: 'Donation', icon: 'volunteer_activism', route: '/donation' },
    { name: 'Report', icon: 'bar_chart', route: '/report' },
    { name: 'Settings', icon: 'settings', route: '/dashboard/settings' },
  ];

  public toggleSidebar(): void {
    this.isSidebarCollapsed.update((collapsed) => !collapsed);
  }

  public async onLogout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
