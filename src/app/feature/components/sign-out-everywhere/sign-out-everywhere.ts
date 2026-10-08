import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ServiceError } from '../../../core/services/service-error';
import { UserService } from '../../../data/services/user.service';

/**
 * Finishes a deactivation whose session revocation failed: the Function deactivates the account
 * first and then answers 502 "retry to finish", so the row shows Deactivated while old sessions
 * may still be alive. This is that retry.
 */
@Component({
  selector: 'app-sign-out-everywhere',
  template: `
    <button
      type="button"
      class="btn-ghost"
      [attr.aria-label]="label() + ': ' + name()"
      [disabled]="running()"
      (click)="signOut()"
    >
      {{ label() }}
    </button>
    <span class="result t-tertiary" role="status" [class.is-error]="failed()">{{ message() }}</span>
  `,
  styles: `
    .result {
      display: block;
    }

    .result.is-error {
      color: var(--func-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignOutEverywhere {
  private readonly userService = inject(UserService);

  public readonly userId = input.required<string>();
  public readonly name = input.required<string>();

  public readonly running = signal(false);
  public readonly failed = signal(false);
  public readonly message = signal('');
  public readonly label = computed(() =>
    this.failed() ? 'Retry sign out' : 'Sign out everywhere',
  );

  public async signOut(): Promise<void> {
    this.running.set(true);
    this.message.set('');
    try {
      await this.userService.forceExpireSessions(this.userId());
      this.failed.set(false);
      this.message.set('Signed out everywhere');
    } catch (err) {
      this.failed.set(true);
      this.message.set(err instanceof ServiceError ? err.message : 'Could not sign out. Retry.');
    } finally {
      this.running.set(false);
    }
  }
}
