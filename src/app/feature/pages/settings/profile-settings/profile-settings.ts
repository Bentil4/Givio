import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  type AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { AccountSettingsService } from '../../../../data/services/account-settings.service';
import { AuthService } from '../../../../data/services/auth.service';
import { normalizePhone, phoneValidator } from '../../../../utils/phone.util';
import { SaveState, readyToSave, showsError } from '../settings-form';

// Appwrite's own limits for an Account's name and password.
const NAME_MAX_LENGTH = 128;
const PASSWORD_MIN_LENGTH = 8;
const NOT_BLANK = Validators.pattern(/\S/);

/**
 * Settings → My profile: the signed-in person's name, phone number and password, each saved
 * on its own. Works the same for every tier — it only touches their own Account.
 */
@Component({
  selector: 'app-profile-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './profile-settings.html',
  styleUrl: '../settings-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSettings {
  private readonly accountSettings = inject(AccountSettingsService);
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly user = inject(AuthService).currentUser();

  protected readonly showsError = showsError;
  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  public readonly nameSave = new SaveState();
  public readonly phoneSave = new SaveState();
  public readonly passwordSave = new SaveState();

  public readonly nameForm = this.formBuilder.group({
    name: [
      this.user?.name ?? '',
      [Validators.required, NOT_BLANK, Validators.maxLength(NAME_MAX_LENGTH)],
    ],
  });

  public readonly phoneForm = this.formBuilder.group({
    phone: [this.user?.phone ?? '', [Validators.required, phoneValidator]],
    password: ['', Validators.required],
  });

  public readonly passwordForm = this.formBuilder.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
    confirmPassword: ['', [Validators.required, matchesNewPassword]],
  });

  public async saveName(formElement: HTMLFormElement): Promise<void> {
    if (!readyToSave(this.nameForm, this.nameSave, formElement)) return;
    const name = this.nameForm.controls.name.value.trim();
    await this.nameSave.run(() => this.accountSettings.updateName(name), 'Your name is saved.');
  }

  public async savePhone(formElement: HTMLFormElement): Promise<void> {
    if (!readyToSave(this.phoneForm, this.phoneSave, formElement)) return;
    const { phone, password } = this.phoneForm.getRawValue();
    const saved = await this.phoneSave.run(
      () => this.accountSettings.updatePhone(normalizePhone(phone), password),
      'Your phone number is saved.',
    );
    if (saved) this.phoneForm.controls.password.reset();
  }

  public async savePassword(formElement: HTMLFormElement): Promise<void> {
    // The confirmation is checked against the new password as it is now, not as first typed.
    this.passwordForm.controls.confirmPassword.updateValueAndValidity();
    if (!readyToSave(this.passwordForm, this.passwordSave, formElement)) return;
    const { newPassword, currentPassword } = this.passwordForm.getRawValue();
    const saved = await this.passwordSave.run(
      () => this.accountSettings.updatePassword(newPassword, currentPassword),
      'Your password is changed.',
    );
    if (saved) this.passwordForm.reset();
  }
}

function matchesNewPassword(control: AbstractControl<string>): ValidationErrors | null {
  const newPassword = control.parent?.get('newPassword')?.value;
  return control.value && control.value !== newPassword ? { mismatch: true } : null;
}
