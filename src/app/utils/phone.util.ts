import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// Same E.164 rule as the Function's isValidPhone (functions/set-role-and-permissions/src/shared.js).
export const E164_PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

/** Drops the spaces, dashes and parentheses people type into a phone number. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s()-]/g, '');
}

/** An empty value passes — pair with Validators.required where the number is mandatory. */
export const phoneValidator: ValidatorFn = (
  control: AbstractControl<string>,
): ValidationErrors | null => {
  const value = normalizePhone(control.value ?? '');
  return value === '' || E164_PHONE_PATTERN.test(value) ? null : { phone: true };
};
