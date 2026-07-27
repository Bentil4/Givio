import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Button, Input } from '../../../../shared/components';
import { Select } from '../../../../shared/components/select/select';
import { UserRepository } from '../../../../data/repositories/user-repository';
import { RepositoryError } from '../../../../data/repositories/repository-error';
import type { AdminUser } from '../../../../data/models/admin-user';
import type { Role } from '../../../../data/models/role';

type ConfirmAction = 'deactivate' | 'reactivate' | 'delete';

@Component({
  selector: 'app-admin-settings',
  imports: [ReactiveFormsModule, Button, Input, Select],
  templateUrl: './admin-settings.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettings implements OnInit {
  private readonly userRepository = inject(UserRepository);
  private readonly formBuilder = inject(FormBuilder);

  public readonly roleOptions = [
    { label: 'Admin', value: 'admin' },
    { label: 'Operator', value: 'operator' },
  ];

  public users = signal<AdminUser[]>([]);
  public loading = signal(false);
  public listError = signal<string | null>(null);

  public showFormDialog = signal(false);
  public editingUser = signal<AdminUser | null>(null);
  public formError = signal<string | null>(null);
  public formSubmitting = signal(false);
  public generatedPasswordNotice = signal<string | null>(null);

  public confirmTarget = signal<{ action: ConfirmAction; user: AdminUser } | null>(null);
  public confirmSubmitting = signal(false);

  public form = this.formBuilder.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    role: ['', Validators.required],
    password: [''],
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    this.listError.set(null);
    try {
      this.users.set(await this.userRepository.listUsers());
    } catch (err) {
      this.listError.set(err instanceof RepositoryError ? err.message : 'Failed to load users');
    } finally {
      this.loading.set(false);
    }
  }

  openCreateDialog(): void {
    this.editingUser.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', email: '', role: '', password: '' });
    this.showFormDialog.set(true);
  }

  openEditDialog(user: AdminUser): void {
    this.editingUser.set(user);
    this.formError.set(null);
    this.form.reset({ name: user.name, email: user.email, role: user.role ?? '', password: '' });
    this.showFormDialog.set(true);
  }

  closeFormDialog(): void {
    this.showFormDialog.set(false);
  }

  async submitForm(): Promise<void> {
    if (this.form.invalid) {
      return;
    }

    this.formError.set(null);
    this.formSubmitting.set(true);

    const { name, email, role, password } = this.form.value;
    const editing = this.editingUser();

    try {
      if (editing) {
        await this.userRepository.updateUser(editing.id, {
          name: name ?? undefined,
          email: email ?? undefined,
          role: (role as Role) ?? undefined,
        });
      } else {
        const result = await this.userRepository.createUser({
          name: name ?? '',
          email: email ?? '',
          role: role as Role,
          password: password || undefined,
        });
        if (result.generatedPassword) {
          this.generatedPasswordNotice.set(result.generatedPassword);
        }
      }
      this.showFormDialog.set(false);
      await this.loadUsers();
    } catch (err) {
      this.formError.set(err instanceof RepositoryError ? err.message : 'Something went wrong');
    } finally {
      this.formSubmitting.set(false);
    }
  }

  dismissGeneratedPassword(): void {
    this.generatedPasswordNotice.set(null);
  }

  requestDeactivate(user: AdminUser): void {
    this.confirmTarget.set({ action: 'deactivate', user });
  }

  requestReactivate(user: AdminUser): void {
    this.confirmTarget.set({ action: 'reactivate', user });
  }

  requestDelete(user: AdminUser): void {
    this.confirmTarget.set({ action: 'delete', user });
  }

  cancelConfirm(): void {
    this.confirmTarget.set(null);
  }

  async confirmActionSubmit(): Promise<void> {
    const target = this.confirmTarget();
    if (!target) {
      return;
    }

    this.confirmSubmitting.set(true);
    try {
      const active = target.action === 'reactivate';
      await this.userRepository.setUserActive(target.user.id, active);
      this.confirmTarget.set(null);
      await this.loadUsers();
    } catch (err) {
      this.listError.set(err instanceof RepositoryError ? err.message : 'Something went wrong');
    } finally {
      this.confirmSubmitting.set(false);
    }
  }
}
