import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Input, Button, Preloader } from '../../../shared/components';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore, ROLE_HOME } from '../../../data/stores/auth-store';

@Component({
  selector: 'app-login',
  imports: [Input, Button, Preloader, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authStore = inject(AuthStore);

  public showPassword = signal(false);
  public isLoading = signal(false);
  public showPreloader = signal(false);
  public errorMessage = signal<string | null>(null);

  public loginForm = this.formBuilder.group({
    email: ['', { validators: [Validators.required], asyncValidators: [] }],
    password: ['', { validators: [Validators.required], asyncValidators: [] }],
  });

  async onSubmit() {
    this.errorMessage.set(null);
    const { email, password } = this.loginForm.value;
    this.isLoading.set(true);
    this.showPreloader.set(true);
    try {
      await this.authStore.login(email ?? '', password ?? '');
      const role = this.authStore.role();
      if (role) {
        this.router.navigate([ROLE_HOME[role]]);
      } else {
        // Authenticated with Appwrite, but no admin/operator label — don't leave a
        // dangling session behind what looks like a failed login.
        await this.authStore.logout();
        this.errorMessage.set('Invalid credentials');
      }
    } catch {
      this.errorMessage.set('Invalid credentials');
    } finally {
      this.isLoading.set(false);
    }
  }

  public togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }
}
