import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Role } from '../../../../data/models/role';

export type UserStatus = 'active' | 'invited' | 'deactivated';

export interface ManagedUser {
  readonly id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  status: UserStatus;
  lastActive: string;
  activeSessions: number;
}

/**
 * User management.
 *
 * The security model is stated on the page rather than buried in docs, because it is the
 * thing an Admin most needs to trust: roles are written server-side through an Appwrite
 * function, so a role can never be changed from the browser, and deactivating force-expires
 * every session on every device.
 *
 * Family members are deliberately absent from this list — they have no account at all. The
 * event code IS the credential, which is why there is nothing here to create or revoke for
 * them beyond regenerating the code on the event itself.
 */
@Component({
  selector: 'app-admin-users',
  imports: [MatIconModule, ReactiveFormsModule],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsers {
  private readonly fb = inject(FormBuilder);

  // ── replace with service-backed signals ──────────────────────────────
  public readonly users = signal<readonly ManagedUser[]>([]);
  public readonly loading = signal(true);
  public readonly currentUserId = signal<string>('');
  // ─────────────────────────────────────────────────────────────────────

  public readonly roleFilter = signal<Role | 'all'>('all');
  public readonly search = signal('');
  public readonly creating = signal(false);
  public readonly confirmingToggle = signal<ManagedUser | null>(null);
  public readonly busy = signal(false);

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
        body: 'They will be able to sign in again immediately with their existing password. Their '
          + 'past event assignments are restored.',
        cta: 'Reactivate',
        danger: false,
      };
    }

    const sessions = u.activeSessions;
    return {
      title: `Deactivate ${u.name}?`,
      body: sessions > 0
        ? `They will be signed out of ${sessions} ${sessions === 1 ? 'device' : 'devices'} `
          + 'immediately and cannot sign in again. Donations they already recorded are untouched — '
          + 'nothing is deleted.'
        : 'They will not be able to sign in again. Donations they already recorded are untouched — '
          + 'nothing is deleted.',
      cta: 'Deactivate',
      danger: true,
    };
  });

  public roleLabel(role: Role): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  public statusLabel(status: UserStatus): string {
    return status === 'invited' ? 'Invited' : status === 'active' ? 'Active' : 'Deactivated';
  }

  public statusChip(status: UserStatus): string {
    switch (status) {
      case 'active': return 'tag-success';
      case 'invited': return 'tag-info';
      default: return 'tag-default';
    }
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
    this.creating.set(true);
    this.form.reset({ role: 'operator' });
  }

  public closeCreate(): void { this.creating.set(false); }

  public async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    try {
      // await userService.create(this.form.getRawValue());
      // The role is applied by an Appwrite function, never by the client.
      this.closeCreate();
    } finally {
      this.busy.set(false);
    }
  }

  public askToggle(u: ManagedUser): void { this.confirmingToggle.set(u); }
  public dismissToggle(): void { this.confirmingToggle.set(null); }

  public async confirmToggle(): Promise<void> {
    this.busy.set(true);
    try {
      // await userService.setActive(u.id, u.status === 'deactivated');
      this.dismissToggle();
    } finally {
      this.busy.set(false);
    }
  }

  public invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
