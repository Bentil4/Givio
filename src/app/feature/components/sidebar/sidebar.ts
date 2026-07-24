import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { INavbarItem, IUserProfile } from '../../../auth/model/user.model';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';

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
  public toggleCollapsed = output<void>();
}
