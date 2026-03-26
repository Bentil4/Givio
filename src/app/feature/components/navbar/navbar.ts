import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { INavbarItem, IUserProfile } from '../../../auth/model/user.model';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, MatIconModule, MatBadgeModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Navbar {
  public navItems = input.required<INavbarItem[]>();
  public userProfile = input.required<IUserProfile[]>();
}
