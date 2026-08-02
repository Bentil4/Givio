import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Input, Button, Preloader } from '../../../shared/components';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, ROLE_HOME } from '../../../data/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [Input, Button, Preloader, ReactiveFormsModule],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  public showPassword = signal(false);
  public isLoading = signal(false);
  public errorMessage = signal<string | null>(null);

  public loginForm = this.formBuilder.group({
    email: ['', { validators: [Validators.required], asyncValidators: [] }],
    password: ['', { validators: [Validators.required], asyncValidators: [] }],
  });

  async onSubmit() {
    this.errorMessage.set(null);
    const { email, password } = this.loginForm.value;
    this.isLoading.set(true);
    try {
      await this.authService.login(email ?? '', password ?? '');
      const role = this.authService.role();
      if (role) {
        this.router.navigate([ROLE_HOME[role]]);
      } else {
        // Authenticated with Appwrite, but no admin/operator label — don't leave a
        // dangling session behind what looks like a failed login.
        await this.authService.logout();
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
