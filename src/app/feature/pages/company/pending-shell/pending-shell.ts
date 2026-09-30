import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, NgOptimizedImage } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../../data/services/auth.service';
import { TenantService } from '../../../../data/services/tenant.service';

interface ShellCopy {
  title: string;
  body: string;
  showSubmitted: boolean;
}

/**
 * UX-DR9: the only surface a not-yet-approved Organizer can reach. Deliberately a standalone
 * page rather than a layout child — there is no sidebar or nav to hide. The rejected and
 * suspended messages never carry a reason (FR-9 non-disclosure).
 */
@Component({
  selector: 'app-pending-shell',
  imports: [DatePipe, NgOptimizedImage],
  templateUrl: './pending-shell.html',
  styleUrl: './pending-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingShell {
  private readonly tenantService = inject(TenantService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  public readonly tenant = this.tenantService.tenant;
  public readonly checking = signal(false);
  public readonly checkedMessage = signal<string | null>(null);

  public readonly copy = computed<ShellCopy>(() => {
    switch (this.tenant()?.status) {
      case 'pending':
        return {
          title: 'Your application is under review',
          body:
            'Thanks for applying. A Givio admin will review your company details and document, ' +
            "then call you to verify them. You'll get full access as soon as you're approved.",
          showSubmitted: true,
        };
      case 'rejected':
        return {
          title: "This application wasn't approved",
          body: 'If you have questions about your application, contact Givio support.',
          showSubmitted: false,
        };
      case 'suspended':
        return {
          title: "This company account isn't active",
          body: 'If you have questions about your account, contact Givio support.',
          showSubmitted: false,
        };
      default:
        return {
          title: "We couldn't load your application status",
          body: 'Check your connection, then try again.',
          showSubmitted: false,
        };
    }
  });

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }

  public async checkAgain(): Promise<void> {
    this.checking.set(true);
    this.checkedMessage.set(null);
    try {
      const context = await this.tenantService.load(true);
      if (context?.tenant?.status === 'approved') {
        await this.router.navigateByUrl('/company');
        return;
      }
      this.checkedMessage.set('Status checked just now — nothing has changed yet.');
    } catch {
      this.checkedMessage.set("We couldn't check your status. Try again in a moment.");
    } finally {
      this.checking.set(false);
    }
  }

  public async signOut(): Promise<void> {
    await this.authService.logout();
    await this.router.navigate(['/login']);
  }
}
