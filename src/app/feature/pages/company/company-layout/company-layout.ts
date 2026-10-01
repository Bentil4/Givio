import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { BreakpointObserver } from '@angular/cdk/layout';
import { INavbarItem, IUserProfile } from '../../../../data/models/user.model';
import { Sidebar } from '../../../components/sidebar/sidebar';
import { Breadcrumb } from '../../../../shared/components';
import { AuthService } from '../../../../data/services/auth.service';
import { TenantService } from '../../../../data/services/tenant.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { MOBILE_NAV_QUERY } from '../../../../utils/breakpoints.util';

/**
 * Shell for an approved tenant's Organizer tier (/company). Only ever rendered under
 * approvedCompanyMatch — a pending/rejected tenant gets PendingShell instead, never this
 * layout with items hidden. Later stories add their pages to COMPANY_CHILD_ROUTES and a
 * matching entry to navItems.
 */
@Component({
  selector: 'app-company-layout',
  imports: [RouterOutlet, Sidebar, MatIconModule, Breadcrumb],
  templateUrl: './company-layout.html',
  styleUrl: './company-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyLayout {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly tenantService = inject(TenantService);

  public readonly theme = this.themeService.theme;
  public readonly isSidebarCollapsed = signal(false);
  public readonly isMobileNavOpen = signal(false);
  public readonly userProfile: IUserProfile[] = [];

  private readonly isSuperOrganizer = computed(
    () => this.tenantService.context()?.membership.role === 'super_organizer',
  );

  public readonly navItems = computed<INavbarItem[]>(() => [
    { name: 'Dashboard', icon: 'dashboard', route: '/company' },
    { name: 'Events', icon: 'event', route: '/company/events' },
    { name: 'Team', icon: 'group', route: '/company/team' },
    { name: 'Contact Admin', icon: 'support_agent', route: '/company/support' },
    ...(this.isSuperOrganizer()
      ? [
          { name: 'Activity log', icon: 'history', route: '/company/audit' },
          { name: 'Reports', icon: 'summarize', route: '/company/reports' },
        ]
      : []),
  ]);

  constructor() {
    inject(BreakpointObserver)
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
