import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { INavbarItem, IUserProfile } from '../../../data/models/user.model';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { Theme } from '../../../core/services/theme.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, MatIconModule, MatBadgeModule, MatTooltipModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  public navItems = input.required<INavbarItem[]>();
  public userProfile = input.required<IUserProfile[]>();
  public collapsed = input<boolean>(false);
  /** Story 5.1: below the mobile breakpoint, the sidebar is an off-canvas drawer instead of an
   *  always-visible column — independent of `collapsed`, which is a desktop-only preference. */
  public mobileOpen = input<boolean>(false);
  public theme = input<Theme>('light');
  public toggleCollapsed = output<void>();
  public dismissMobile = output<void>();
  public toggleTheme = output<void>();
  public logout = output<void>();

  /**
   * routerLinkActive defaults to prefix matching, so a nav item whose route is a path-prefix
   * of a sibling's (e.g. '/dashboard' before '/dashboard/events') stays highlighted on every
   * other page too. True for exactly that case — any item that is itself a prefix of some
   * other item's route — so the index link only lights up on its own exact route, while every
   * other item keeps prefix matching (an Events link still highlights on an event detail page).
   */
  public isExactRoute(route: string): boolean {
    return this.navItems().some(
      (other) => other.route !== route && other.route.startsWith(route + '/'),
    );
  }
}
