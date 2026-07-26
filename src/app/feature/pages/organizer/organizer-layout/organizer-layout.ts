import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../../../data/stores/auth-store';

@Component({
  selector: 'app-organizer-layout',
  imports: [RouterOutlet],
  templateUrl: './organizer-layout.html',
  styleUrl: './organizer-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerLayout {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  public async onLogout(): Promise<void> {
    await this.authStore.logout();
    this.router.navigate(['/login']);
  }
}
