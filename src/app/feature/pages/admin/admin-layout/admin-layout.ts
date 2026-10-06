import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
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
import { SyncEngineService } from '../../../../data/services/sync-engine.service';
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
  private readonly syncEngine = inject(SyncEngineService);
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

  public readonly online = this.connectivityService.online;
  public readonly syncing = this.syncEngine.syncing;
  public readonly pendingCount = this.syncEngine.pendingCount;
  public readonly syncedCount = signal(0);
  private previousPendingCount = 0;

  /** Mirrors donation-entry's connection() so every shell reports connectivity the same way. */
  public readonly connection = computed<ConnectionState>(() => {
    if (!this.online()) return 'offline';
    if (this.syncing()) return 'syncing';
    if (this.syncedCount() > 0 && this.pendingCount() === 0) return 'synced';
    return 'online';
  });

  public readonly navItems = computed<INavbarItem[]>(() => [
    { name: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    {
      name: 'Approvals',
      icon: 'how_to_reg',
      route: '/dashboard/approvals',
      badge: this.approvalCounts.total(),
    },
    { name: 'Companies', icon: 'domain', route: '/dashboard/companies' },
    { name: 'Events', icon: 'event', route: '/dashboard/events' },
    { name: 'Donations', icon: 'volunteer_activism', route: '/dashboard/donations' },
    { name: 'Reports', icon: 'bar_chart', route: '/dashboard/reports' },
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

    // Same transient "just synced" pattern as donation-entry.ts: once a drain finishes and
    // the global outbox is empty, show a brief confirmation instead of silently going quiet.
    effect(() => {
      if (this.syncing()) return;
      const count = this.pendingCount();
      if (this.previousPendingCount > 0 && count === 0) {
        this.syncedCount.set(this.previousPendingCount);
        setTimeout(() => this.syncedCount.set(0), 5000);
      }
      this.previousPendingCount = count;
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
