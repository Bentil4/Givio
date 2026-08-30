import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../../data/services/auth.service';
import { UserService } from '../../../../data/services/user.service';
import { ServiceError } from '../../../../data/services/service-error';
import type { AdminUser } from '../../../../data/models/admin-user';
import type { Role } from '../../../../data/models/role';

export type UserStatus = 'active' | 'deactivated';

export interface ManagedUser {
  readonly id: string;
  name: string;
  initials: string;
  email: string;
  role: Role | null;
  status: UserStatus;
  registeredAt: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function toManaged(u: AdminUser): ManagedUser {
  return {
    id: u.id,
    name: u.name,
    initials: initialsOf(u.name),
    email: u.email,
    role: u.role,
    status: u.active ? 'active' : 'deactivated',
    registeredAt: u.registeredAt,
  };
}

/**
 * User management.
 *
 * The security model is stated on the page rather than buried in docs, because it is the
 * thing an Admin most needs to trust: roles are written server-side through an Appwrite
 * function (Story 1.2's UserService -> the set-role-and-permissions Function), so a role can
 * never be changed from the browser, and deactivating force-expires every session on every
 * device.
 *
 * Family members are deliberately absent from this list — they have no account at all. The
 * event code IS the credential.
 *
 * NOTE: the real Appwrite Users listing (UserService.listUsers) does not currently return an
 * "invited" state or an active-session count, so this screen only distinguishes
 * active/deactivated, and the deactivate-confirmation copy always uses the generic
 * ("cannot sign in again") wording rather than naming a device count.
 */
@Component({
  selector: 'app-admin-users',
  imports: [MatIconModule, ReactiveFormsModule, DatePipe],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsers implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);

  public readonly users = signal<readonly ManagedUser[]>([]);
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly currentUserId = computed(() => this.authService.currentUser()?.$id ?? '');

  public readonly roleFilter = signal<Role | 'all'>('all');
  public readonly search = signal('');
  public readonly creating = signal(false);
  public readonly editing = signal<ManagedUser | null>(null);
  public readonly confirmingToggle = signal<ManagedUser | null>(null);
  public readonly busy = signal(false);
  public readonly formError = signal<string | null>(null);
  public readonly generatedPassword = signal<string | null>(null);

  public readonly roles: Role[] = ['admin', 'operator'];
  public readonly roleOptions: (Role | 'all')[] = ['all', 'admin', 'operator'];
  public readonly skeletons = Array.from({ length: 6 }, (_, i) => i);

  public readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['operator' as Role, Validators.required],
  });

  public readonly roleCards: { value: Role; label: string; desc: string }[] = [
    {
      value: 'operator',
      label: 'Operator',
      desc: 'Records donations at the desk. Sees only their assigned events.',
    },
    {
      value: 'admin',
      label: 'Admin',
      desc: 'Full oversight: events, users, corrections, exports, audit trail.',
    },
  ];

  public readonly visible = computed(() => {
    const role = this.roleFilter();
    const needle = this.search().trim().toLowerCase();
    return this.users().filter((u) => {
      if (role !== 'all' && u.role !== role) return false;
      if (needle && !(u.name + ' ' + u.email).toLowerCase().includes(needle)) return false;
      return true;
    });
  });

  public readonly isEmpty = computed(() => !this.loading() && this.visible().length === 0);
  public readonly filtered = computed(() => this.roleFilter() !== 'all' || !!this.search().trim());

  public readonly toggleCopy = computed(() => {
    const u = this.confirmingToggle();
    if (!u) return null;

    if (u.status === 'deactivated') {
      return {
        title: `Reactivate ${u.name}?`,
        body: 'They will be able to sign in again immediately with their existing password.',
        cta: 'Reactivate',
        danger: false,
      };
    }

    return {
      title: `Deactivate ${u.name}?`,
      body: 'They will be signed out of every device immediately and cannot sign in again. '
        + 'Donations they already recorded are untouched — nothing is deleted.',
      cta: 'Deactivate',
      danger: true,
    };
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  // Deliberately never clears loadError on success — a caller recovering from its own
  // action failure sets loadError to that failure's message and then calls loadUsers() to
  // refresh the table; a successful refresh here must not silently wipe that message out.
  async loadUsers(): Promise<void> {
    this.loading.set(true);
    try {
      this.users.set((await this.userService.listUsers()).map(toManaged));
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Failed to load users');
    } finally {
      this.loading.set(false);
    }
  }

  public roleLabel(role: Role | null): string {
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : '—';
  }

  public statusLabel(status: UserStatus): string {
    return status === 'active' ? 'Active' : 'Deactivated';
  }

  public statusChip(status: UserStatus): string {
    return status === 'active' ? 'tag-success' : 'tag-default';
  }

  /** An Admin locking themselves out of their own event mid-service is unrecoverable. */
  public canToggle(u: ManagedUser): boolean {
    return u.id !== this.currentUserId();
  }

  public setRoleFilter(r: Role | 'all'): void { this.roleFilter.set(r); }
  public setSearch(v: string): void { this.search.set(v); }

  public clearFilters(): void {
    this.roleFilter.set('all');
    this.search.set('');
  }

  public openCreate(): void {
    this.editing.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', email: '', role: 'operator' });
    this.creating.set(true);
  }

  public openEdit(u: ManagedUser): void {
    this.editing.set(u);
    this.formError.set(null);
    this.form.reset({ name: u.name, email: u.email, role: u.role ?? 'operator' });
    this.creating.set(true);
  }

  public closeCreate(): void {
    this.creating.set(false);
  }

  public dismissGeneratedPassword(): void {
    this.generatedPassword.set(null);
  }

  public async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.formError.set(null);
    const { name, email, role } = this.form.getRawValue();
    const editing = this.editing();

    try {
      if (editing) {
        await this.userService.updateUser(editing.id, { name, email, role });
      } else {
        // The role is applied by the set-role-and-permissions Function, never by the client.
        const result = await this.userService.createUser({ name, email, role });
        if (result.generatedPassword) {
          this.generatedPassword.set(result.generatedPassword);
        }
      }
      this.closeCreate();
    } catch (err) {
      this.formError.set(err instanceof ServiceError ? err.message : 'Something went wrong');
    } finally {
      this.busy.set(false);
      // Refresh regardless of outcome — a partially-applied edit shouldn't leave the table
      // showing stale pre-edit data.
      await this.loadUsers();
    }
  }

  public askToggle(u: ManagedUser): void { this.confirmingToggle.set(u); }
  public dismissToggle(): void { this.confirmingToggle.set(null); }

  public async confirmToggle(): Promise<void> {
    const u = this.confirmingToggle();
    if (!u) return;

    this.busy.set(true);
    this.loadError.set(null);
    try {
      await this.userService.setUserActive(u.id, u.status === 'deactivated');
      this.dismissToggle();
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Something went wrong');
    } finally {
      this.busy.set(false);
      await this.loadUsers();
    }
  }

  public invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
