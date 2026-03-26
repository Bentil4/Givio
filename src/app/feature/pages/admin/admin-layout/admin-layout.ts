import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { INavbarItem, IUserProfile } from '../../../../auth/model/user.model';
import { Navbar } from '../../../components/navbar/navbar';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, Navbar],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
  // private authService = inject(AuthService);
  private router = inject(Router);

  // public isSidebarOpen = signal(false);
  public userProfile: IUserProfile[] = [];

  public navItems: INavbarItem[] = [
    {
      name: 'Dashboard',
      icon: 'lucide:layout-dashboard',
      route: '/dashboard',
    },
    { name: 'Events', icon: 'lucide:vote', route: '/events' },
    { name: 'Donation', icon: 'lucide:plus-circle', route: '/donation' },
    { name: 'Report', icon: 'lucide:users', route: '/report' },
    { name: 'Settings', icon: 'lucide:settings', route: '/settings' },
  ];
}
