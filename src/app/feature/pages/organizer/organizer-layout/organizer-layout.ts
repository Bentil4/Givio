import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../../data/services/auth.service';

@Component({
  selector: 'app-organizer-layout',
  imports: [RouterOutlet],
  templateUrl: './organizer-layout.html',
  styleUrl: './organizer-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerLayout {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  public async onLogout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
