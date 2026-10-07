import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { BreakpointObserver } from '@angular/cdk/layout';
import { INavbarItem } from '../../../../data/models/user.model';
import { buildSidebarProfile } from '../../../../utils/sidebar-profile.util';
import { Sidebar } from '../../../components/sidebar/sidebar';
import { Breadcrumb } from '../../../../shared/components';
import {
  ConnectionBanner,
  type ConnectionState,
} from '../../../components/connection-banner/connection-banner';
import { AuthService } from '../../../../data/services/auth.service';
import { ConnectivityService } from '../../../../core/services/connectivity.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { ApprovalCountsService } from '../../../../data/services/approval-counts.service';
import { MOBILE_NAV_QUERY } from '../../../../utils/breakpoints.util';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, Sidebar, MatIconModule, ConnectionBanner, Breadcrumb],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly connectivityService = inject(ConnectivityService);
  private readonly themeService = inject(ThemeService);
  private readonly approvalCounts = inject(ApprovalCountsService);

  public readonly theme = this.themeService.theme;
  public isSidebarCollapsed = signal(false);
  /** Story 5.1: off-canvas drawer state below the mobile breakpoint — see sidebar.scss. */
  public isMobileNavOpen = signal(false);
  public readonly profile = computed(() =>
    buildSidebarProfile(
      this.authService.currentUser(),
      this.authService.isSuperAdmin() ? 'super_admin' : 'admin',
    ),
  );

  /** An Admin device queues nothing offline (AD-12, amended 2026-10-07), so there is no sync
   *  progress to report — only whether the connection is up. */
  public readonly connection = computed<ConnectionState>(() =>
    this.connectivityService.online() ? 'online' : 'offline',
  );

  public readonly navItems = computed<INavbarItem[]>(() => [
    { name: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    {
      name: 'Approvals',
      icon: 'how_to_reg',
      route: '/dashboard/approvals',
      badge: this.approvalCounts.total(),
    },
    { name: 'Companies', icon: 'domain', route: '/dashboard/companies' },
    { name: 'Audit trail', icon: 'history', route: '/dashboard/audit' },
    { name: 'Users', icon: 'group', route: '/dashboard/users' },
    ...(this.authService.isSuperAdmin()
      ? [{ name: 'Admins', icon: 'admin_panel_settings', route: '/dashboard/admins' }]
      : []),
  ]);

  constructor() {
    this.approvalCounts.pollWhileAlive(inject(DestroyRef));

    // The drawer (and its scrim) only exist below MOBILE_NAV_QUERY — if a resize or
    // orientation change carries the viewport back past it while open, close it. Otherwise
    // .sidebar-scrim (styled only inside that same media query) is left as a stale, unstyled
    // but still-clickable div once the query stops matching.
    this.breakpointObserver
      .observe(MOBILE_NAV_QUERY)
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        if (!state.matches) {
          this.closeMobileNav();
        }
      });
  }

  public toggleSidebar(): void {
    this.isSidebarCollapsed.update((collapsed) => !collapsed);
  }

  public toggleMobileNav(): void {
    this.isMobileNavOpen.update((open) => !open);
  }

  public closeMobileNav(): void {
    this.isMobileNavOpen.set(false);
  }

  public toggleTheme(): void {
    this.themeService.toggle();
  }

  public async onLogout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
