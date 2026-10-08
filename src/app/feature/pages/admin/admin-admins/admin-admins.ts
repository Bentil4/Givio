import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../../data/services/auth.service';
import { UserService } from '../../../../data/services/user.service';
import { SignOutEverywhere } from '../../../components/sign-out-everywhere/sign-out-everywhere';
import { ServiceError } from '../../../../core/services/service-error';
import type { AdminUser } from '../../../../data/models/admin-user';

export type AdminAction = 'suspend' | 'reinstate' | 'demote';

interface PendingAction {
  readonly kind: AdminAction;
  readonly user: AdminUser;
}

interface RowError {
  readonly userId: string;
  readonly message: string;
}

const ACTION_COPY: Record<
  AdminAction,
  { title: (name: string) => string; body: string; cta: string; danger: boolean }
> = {
  suspend: {
    title: (name) => `Suspend ${name}?`,
    body:
      'They are signed out of every device now and lose approval, suspension, and audit-log ' +
      'access. Everything they already did stays in the audit trail under their name.',
    cta: 'Suspend',
    danger: true,
  },
  reinstate: {
    title: (name) => `Reinstate ${name}?`,
    body: 'They can sign in again immediately with their existing password, as an Admin.',
    cta: 'Reinstate',
    danger: false,
  },
  demote: {
    title: (name) => `Demote ${name} to Operator?`,
    body:
      'They lose every Admin capability on their next request. Their account and audit history ' +
      'are kept; you can promote them again later.',
    cta: 'Demote',
    danger: true,
  },
};

function errorMessage(err: unknown): string {
  return err instanceof ServiceError ? err.message : 'Something went wrong';
}

/**
 * Super-Admin-only Admin account management (FR-26, AD-11). Every write goes through the same
 * set-role-and-permissions actions the Users screen uses; the Function — not this page or its
 * route guard — is what actually refuses anyone but the Super Admin. Nothing here deletes an
 * account, so a suspended or demoted Admin's audit attribution is never lost (FR-13).
 */
@Component({
  selector: 'app-admin-admins',
  imports: [MatIconModule, ReactiveFormsModule, DatePipe, CdkTrapFocus, SignOutEverywhere],
  templateUrl: './admin-admins.html',
  styleUrl: './admin-admins.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAdmins implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);

  private readonly users = signal<readonly AdminUser[]>([]);
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly rowError = signal<RowError | null>(null);
  public readonly busy = signal(false);
  public readonly formError = signal<string | null>(null);
  public readonly creating = signal(false);
  public readonly promoting = signal(false);
  public readonly pending = signal<PendingAction | null>(null);
  public readonly generatedPassword = signal<string | null>(null);
  public readonly currentUserId = computed(() => this.authService.currentUser()?.$id ?? '');
  public readonly skeletons = [0, 1, 2];

  public readonly admins = computed(() => this.users().filter((u) => u.role === 'admin'));
  public readonly promotable = computed(() =>
    this.users().filter((u) => u.role === 'operator' && u.active),
  );

  public readonly pendingCopy = computed(() => {
    const p = this.pending();
    if (!p) return null;
    const copy = ACTION_COPY[p.kind];
    return { title: copy.title(p.user.name), body: copy.body, cta: copy.cta, danger: copy.danger };
  });

  public readonly createForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    inviteEmail: [true],
  });

  public readonly promoteForm = this.fb.nonNullable.group({
    userId: ['', Validators.required],
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.users.set(await this.userService.listUsers());
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Failed to load admins');
    } finally {
      this.loading.set(false);
    }
  }

  /** The Super Admin row is never actionable in-app — succession is out-of-band (AD-11). */
  public canManage(u: AdminUser): boolean {
    return !u.superAdmin && u.id !== this.currentUserId();
  }

  public rowErrorFor(u: AdminUser): string | null {
    const e = this.rowError();
    return e?.userId === u.id ? e.message : null;
  }

  public openCreate(): void {
    this.formError.set(null);
    this.createForm.reset({ name: '', email: '', inviteEmail: true });
    this.creating.set(true);
  }

  public closeCreate(): void {
    this.creating.set(false);
  }

  public openPromote(): void {
    this.formError.set(null);
    this.promoteForm.reset({ userId: '' });
    this.promoting.set(true);
  }

  public closePromote(): void {
    this.promoting.set(false);
  }

  public ask(kind: AdminAction, user: AdminUser): void {
    this.rowError.set(null);
    this.pending.set({ kind, user });
  }

  public dismissPending(): void {
    this.pending.set(null);
  }

  public dismissGeneratedPassword(): void {
    this.generatedPassword.set(null);
  }

  public invalid(control: 'name' | 'email'): boolean {
    const c = this.createForm.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  public async create(): Promise<void> {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const { name, email, inviteEmail } = this.createForm.getRawValue();
    await this.runForm(async () => {
      const result = await this.userService.createUser({
        name,
        email,
        role: 'admin',
        ...(inviteEmail ? { inviteChannels: ['email' as const] } : {}),
      });
      this.generatedPassword.set(result.generatedPassword ?? null);
      this.closeCreate();
    });
  }

  public async promote(): Promise<void> {
    if (this.promoteForm.invalid) {
      this.promoteForm.markAllAsTouched();
      return;
    }
    const { userId } = this.promoteForm.getRawValue();
    await this.runForm(async () => {
      await this.userService.updateUser(userId, { role: 'admin' });
      this.closePromote();
    });
  }

  /**
   * Never optimistic (UX Flow 5): the row only changes after the Function confirms and the list
   * is re-read, so a failed suspension can't look like it succeeded.
   */
  public async confirmPending(): Promise<void> {
    const p = this.pending();
    if (!p) return;
    this.busy.set(true);
    try {
      if (p.kind === 'demote') {
        await this.userService.updateUser(p.user.id, { role: 'operator' });
      } else {
        await this.userService.setUserActive(p.user.id, p.kind === 'reinstate');
      }
    } catch (err) {
      this.rowError.set({ userId: p.user.id, message: errorMessage(err) });
    } finally {
      this.busy.set(false);
      this.pending.set(null);
      await this.load();
    }
  }

  private async runForm(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.formError.set(null);
    try {
      await work();
    } catch (err) {
      this.formError.set(errorMessage(err));
    } finally {
      this.busy.set(false);
      await this.load();
    }
  }
}
