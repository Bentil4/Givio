import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Input, Button, Preloader } from '../../../shared/components';
import { ReactiveFormsModule } from '@angular/forms';
import { FormBuilder, Validators } from '@angular/forms';
import { account } from '../../../../lib/appwrite';
import { Models } from 'appwrite';
import { Router } from '@angular/router';

interface IUserPrefs extends Models.Preferences {
  role: 'admin' | 'user' | 'member';
}

@Component({
  selector: 'app-login',
  imports: [Input, Button, Preloader, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private formBuilder = inject(FormBuilder);
  private router = inject(Router);
  public showPassword = signal(false);
  public isLoading = signal(false);
  public showPreloader = signal(false);
  public loggedInUser = signal<Models.User<IUserPrefs> | null>(null);

  public loginForm = this.formBuilder.group({
    email: ['', { validators: [Validators.required], asyncValidators: [] }],
    password: ['', { validators: [Validators.required], asyncValidators: [] }],
  });

  async onSubmit() {
    const { email, password } = this.loginForm.value;
    this.isLoading.set(true);
    this.showPreloader.set(true);
    try {
      await account.deleteSession({ sessionId: 'current' });
    } catch {
      /* no active session */
    }
    try {
      await account.createEmailPasswordSession({ email: email ?? '', password: password ?? '' });
      this.loggedInUser.set(await account.get<IUserPrefs>());
      if (this.loggedInUser()?.prefs?.['role'] === 'admin') {
        this.router.navigate(['/dashboard']);
      } else if (this.loggedInUser()?.prefs?.['role'] === 'user') {
        this.router.navigate(['/user-dashboard']);
      }
    } finally {
      this.isLoading.set(false);
    }
  }
  public togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }
}
