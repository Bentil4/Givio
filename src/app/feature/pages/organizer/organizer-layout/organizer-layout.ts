import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { BreakpointObserver } from '@angular/cdk/layout';
import { filter, map } from 'rxjs';
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
import { TenantService } from '../../../../data/services/tenant.service';
import { MOBILE_NAV_QUERY } from '../../../../utils/breakpoints.util';
import { OperatorEventContext } from '../operator-event-context';
import { EventSwitcher } from '../event-switcher/event-switcher';

const ORGANIZER_SETTINGS_ROUTE = '/organizer/settings';

@Component({
  selector: 'app-organizer-layout',
  imports: [RouterOutlet, Sidebar, MatIconModule, ConnectionBanner, Breadcrumb, EventSwitcher],
  providers: [OperatorEventContext],
  templateUrl: './organizer-layout.html',
  styleUrl: './organizer-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerLayout {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly connectivityService = inject(ConnectivityService);
  private readonly syncEngine = inject(SyncEngineService);
  private readonly themeService = inject(ThemeService);
  private readonly eventContext = inject(OperatorEventContext);

  public readonly showEventSwitcher = this.eventContext.showSwitcher;

  public readonly theme = this.themeService.theme;
  /** Company identity from the status call operatorTenantGuard made on the way in. */
  public readonly brand = inject(TenantService).companyBrand;
  public isSidebarCollapsed = signal(false);
  /** Story 5.1: off-canvas drawer state below the mobile breakpoint — see sidebar.scss. */
  public isMobileNavOpen = signal(false);
  public readonly profile = computed(() =>
    buildSidebarProfile(this.authService.currentUser(), 'operator', ORGANIZER_SETTINGS_ROUTE),
  );

  public readonly online = this.connectivityService.online;
  public readonly syncing = this.syncEngine.syncing;
  public readonly pendingCount = this.syncEngine.pendingCount;
  public readonly syncedCount = signal(0);
  private previousPendingCount = 0;

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Deep links and event-select's "Open desk" carry the Event as `?event=` — an explicit
   *  pick, so it becomes the active Event. */
  private readonly urlEventId = computed(() =>
    this.router.parseUrl(this.currentUrl()).queryParamMap.get('event'),
  );

  /** /organizer/entry and /organizer/entry/phone render their own connectivity indicator
   *  (donation-entry's ConnectionBanner, mobile-entry's inline dot) — showing this one too
   *  would duplicate it. */
  public readonly showConnectionBanner = computed(
    () => !this.currentUrl().startsWith('/organizer/entry'),
  );

  /** Mirrors donation-entry's connection() so every shell reports connectivity the same way. */
  public readonly connection = computed<ConnectionState>(() => {
    if (!this.online()) return 'offline';
    if (this.syncing()) return 'syncing';
    if (this.syncedCount() > 0 && this.pendingCount() === 0) return 'synced';
    return 'online';
  });

  public navItems: INavbarItem[] = [
    { name: 'Dashboard', icon: 'dashboard', route: '/organizer' },
    { name: 'My Events', icon: 'event', route: '/organizer/events' },
    { name: 'Donations', icon: 'volunteer_activism', route: '/organizer/donations' },
    { name: 'Settings', icon: 'settings', route: ORGANIZER_SETTINGS_ROUTE },
  ];

  constructor() {
    void this.eventContext.load();

    effect(() => {
      const eventId = this.urlEventId();
      if (eventId) untracked(() => this.eventContext.pick(eventId));
    });

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

  /** Keeps an Event-scoped page's URL agreeing with the switcher, so a reload or back
   *  navigation can't resurface the previous Event. */
  public onEventPicked(eventId: string): void {
    this.eventContext.pick(eventId);
    if (this.urlEventId()) {
      void this.router.navigate([], {
        queryParams: { event: eventId },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
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

  public openQueue(): void {
    this.router.navigateByUrl('/organizer/entry');
  }

  public toggleTheme(): void {
    this.themeService.toggle();
  }

  public async onLogout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
