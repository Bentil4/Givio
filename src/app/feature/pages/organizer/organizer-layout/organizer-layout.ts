import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { INavbarItem, IUserProfile } from '../../../../auth/model/user.model';
import { Sidebar } from '../../../components/sidebar/sidebar';
import { AuthService } from '../../../../data/services/auth.service';

@Component({
  selector: 'app-organizer-layout',
  imports: [RouterOutlet, Sidebar, MatIconModule],
  templateUrl: './organizer-layout.html',
  styleUrl: './organizer-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerLayout {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  public isSidebarCollapsed = signal(false);
  /** Story 5.1: off-canvas drawer state below the mobile breakpoint — see sidebar.scss. */
  public isMobileNavOpen = signal(false);
  public userProfile: IUserProfile[] = [];

  public navItems: INavbarItem[] = [
    { name: 'Dashboard', icon: 'dashboard', route: '/organizer' },
    { name: 'My Events', icon: 'event', route: '/organizer/events' },
    { name: 'Donations', icon: 'volunteer_activism', route: '/organizer/donations' },
    // No Operator-facing report screen exists yet — the PRD scopes Reports & Export to
    // Admin/Family only. Shown so the intent is visible, not wired to a route.
    { name: 'Report', icon: 'bar_chart', route: '/organizer/report', disabled: true },
  ];

  public toggleSidebar(): void {
    this.isSidebarCollapsed.update((collapsed) => !collapsed);
  }

  public toggleMobileNav(): void {
    this.isMobileNavOpen.update((open) => !open);
  }

  public closeMobileNav(): void {
    this.isMobileNavOpen.set(false);
  }

  public async onLogout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
