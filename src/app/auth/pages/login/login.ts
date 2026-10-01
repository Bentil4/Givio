import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, ROLE_HOME } from '../../../data/services/auth.service';
import { TenantService } from '../../../data/services/tenant.service';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const SUSPENDED = Symbol('suspended');
/** A route to navigate to, SUSPENDED (sign back out and explain), or null (failed sign-in). */
type Destination = string | typeof SUSPENDED | null;

/**
 * Staff sign in — Admin and Operator by Label, Organizers by Membership (/company). Family
 * members never reach this screen; they use /family and an event code.
 *
 * Rate limiting is surfaced honestly: the user is told how many attempts remain BEFORE the
 * lockout, and the lockout screen offers a route forward rather than being a dead end. The
 * attempt counter is a UX affordance only — there's no self-service password reset (an Admin
 * sets/edits passwords per Story 1.3), so the real limit is whatever Appwrite enforces
 * server-side per account/IP.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly tenantService = inject(TenantService);

  public readonly busy = signal(false);
  public readonly showPassword = signal(false);
  public readonly failedAttempts = signal(0);
  public readonly lockedUntil = signal<number | null>(null);
  public readonly serverError = signal<string | null>(null);
  public readonly suspendedSignOut = this.tenantService.suspendedSignOut;

  public readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
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
      ? 'One attempt left before sign-in is paused for 15 minutes.'
      : `You have ${remaining} attempts remaining before sign-in is paused for ` +
          `${LOCKOUT_MINUTES} minutes.`;
  });

  public readonly stats = [
    { value: '100%', label: 'Works offline' },
    { value: '<30s', label: 'Per donation' },
    { value: '3', label: 'Separated roles' },
  ];

  public togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  public invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  public async submit(): Promise<void> {
    if (this.locked()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    this.serverError.set(null);
    this.tenantService.clearSuspendedSignOut();
    const { email, password } = this.form.getRawValue();

    try {
      await this.authService.login(email, password);
      await this.routeSignedInUser();
    } catch {
      this.onFailedAttempt();
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Story 9.2 AC3: a suspended tenant's Operator or Organizer is signed straight back out and
   * told why, rather than let into an area the server would refuse them anyway.
   */
  private async routeSignedInUser(): Promise<void> {
    const destination = await this.signedInDestination();
    if (destination === SUSPENDED) {
      this.failedAttempts.set(0);
      await this.tenantService.signOutSuspendedMember();
      return;
    }
    if (destination === null) {
      // Authenticated with Appwrite, but no usable role — don't leave a dangling session
      // behind what looks like a failed login.
      await this.authService.logout();
      this.onFailedAttempt();
      return;
    }
    this.failedAttempts.set(0);
    this.router.navigate([destination]);
  }

  private async signedInDestination(): Promise<Destination> {
    const role = this.authService.role();
    if (role === 'operator' && (await this.tenantService.isOperatorTenantSuspended(true))) {
      return SUSPENDED;
    }
    return role ? ROLE_HOME[role] : this.labellessDestination();
  }

  /**
   * No platform Label: an Organizer-tier Membership goes to /company (its guards pick the
   * pending shell or the dashboard) unless its tenant is suspended; an Account with no
   * Membership at all is a self-signup abandoned after step 1, so it resumes the wizard. A
   * revoked or Operator-only Membership, or a failed lookup, gets no destination.
   */
  private async labellessDestination(): Promise<Destination> {
    let context;
    try {
      context = await this.tenantService.load(true);
    } catch {
      return null;
    }
    if (context === null) {
      return '/auth/signup';
    }
    const { status, role } = context.membership;
    if (status !== 'active' || role === 'operator') {
      return null;
    }
    return context.tenant?.status === 'suspended' ? SUSPENDED : '/company';
  }

  private onFailedAttempt(): void {
    const attempts = this.failedAttempts() + 1;
    this.failedAttempts.set(attempts);
    this.serverError.set('Email or password is incorrect');
    this.form.controls.password.reset();

    if (attempts >= MAX_ATTEMPTS) {
      this.lockedUntil.set(Date.now() + LOCKOUT_MINUTES * 60_000);
    }
  }
}
