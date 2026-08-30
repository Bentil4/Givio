import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Staff sign in — Admin and Operator. Family members never reach this screen; they use
 * /family and an event code.
 *
 * Rate limiting is surfaced honestly: the user is told how many attempts remain BEFORE the
 * lockout, and the lockout screen offers two ways out rather than being a dead end. A funeral
 * is a bad place to discover you are locked out with no route forward.
 *
 * The attempt counter shown here is a UX affordance only — the real limit is enforced
 * server-side per account and per IP.
 */
@Component({
  selector: 'app-login',
  imports: [MatIconModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  public readonly busy = signal(false);
  public readonly showPassword = signal(false);
  public readonly failedAttempts = signal(0);
  public readonly lockedUntil = signal<number | null>(null);
  public readonly serverError = signal<string | null>(null);

  public readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  public readonly locked = computed(() => {
    const until = this.lockedUntil();
    return until !== null && until > Date.now();
  });

  public readonly attemptsRemaining = computed(() =>
    Math.max(0, MAX_ATTEMPTS - this.failedAttempts()),
  );

  public readonly lockoutMinutes = LOCKOUT_MINUTES;

  /** Shown only once a real attempt has failed — never as a pre-emptive warning. */
  public readonly attemptWarning = computed(() => {
    const remaining = this.attemptsRemaining();
    if (this.failedAttempts() === 0 || this.locked()) return null;
    return remaining === 1
      ? 'One attempt left before this account is locked for 15 minutes.'
      : `You have ${remaining} attempts remaining before this account is locked for `
        + `${LOCKOUT_MINUTES} minutes.`;
  });

  public readonly stats = [
    { value: '100%', label: 'Works offline' },
    { value: '<30s', label: 'Per donation' },
    { value: '3', label: 'Separated roles' },
  ];

  public togglePassword(): void { this.showPassword.update((v) => !v); }

  public invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  public async submit(): Promise<void> {
    if (this.locked()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.busy.set(true);
    this.serverError.set(null);

    try {
      // const session = await authService.login(this.form.getRawValue());
      // Role branching happens here, on the server-issued role — never on a client guess.
      // this.router.navigate([session.role === 'admin' ? '/dashboard' : '/organizer']);
    } catch {
      const attempts = this.failedAttempts() + 1;
      this.failedAttempts.set(attempts);
      this.serverError.set('Email or password is incorrect');
      this.form.controls.password.reset();

      if (attempts >= MAX_ATTEMPTS) {
        this.lockedUntil.set(Date.now() + LOCKOUT_MINUTES * 60_000);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
