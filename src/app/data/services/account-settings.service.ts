import { Injectable, inject } from '@angular/core';
import { AppwriteException } from 'appwrite';
import { ACCOUNT } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { AuthService } from './auth.service';

/** Messages for the Appwrite error codes a change can legitimately fail with. */
type AccountErrorMessages = Partial<Record<number, string>> & { fallback: string };

const WRONG_PASSWORD = 'Current password is incorrect';

/**
 * The signed-in person's own Account details, changed straight through Appwrite Account —
 * no Function involved, since an Account may always edit itself. Each change re-reads the
 * Account so the sidebar shows the new name at once.
 */
@Injectable({ providedIn: 'root' })
export class AccountSettingsService {
  private readonly account = inject(ACCOUNT);
  private readonly authService = inject(AuthService);

  async updateName(name: string): Promise<void> {
    await this.applyAccountChange(() => this.account.updateName({ name }), {
      fallback: "Couldn't update your name",
    });
  }

  /** `phone` must already be E.164; Appwrite asks for the current password to change it. */
  async updatePhone(phone: string, password: string): Promise<void> {
    await this.applyAccountChange(() => this.account.updatePhone({ phone, password }), {
      401: WRONG_PASSWORD,
      409: 'That phone number is already in use',
      fallback: "Couldn't update your phone number",
    });
  }

  async updatePassword(newPassword: string, oldPassword: string): Promise<void> {
    await this.applyAccountChange(
      () => this.account.updatePassword({ password: newPassword, oldPassword }),
      { 401: WRONG_PASSWORD, fallback: "Couldn't change your password" },
    );
  }

  private async applyAccountChange(
    change: () => Promise<unknown>,
    messages: AccountErrorMessages,
  ): Promise<void> {
    try {
      await change();
    } catch (error) {
      throw new ServiceError(accountErrorMessage(error, messages), error);
    }
    // The change itself succeeded; a failed re-read only delays the sidebar until next sign-in.
    await this.authService.refreshCurrentUser().catch(() => undefined);
  }
}

function accountErrorMessage(error: unknown, messages: AccountErrorMessages): string {
  const code = error instanceof AppwriteException ? error.code : undefined;
  return (code !== undefined && messages[code]) || messages.fallback;
}
