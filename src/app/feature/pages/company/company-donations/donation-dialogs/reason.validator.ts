import type { AbstractControl, ValidationErrors } from '@angular/forms';

// The Function's own minimum (tenant-donations/donation-fields.js): enough to stop "typo" and
// force an actual sentence into the audit trail. Counted without outer spaces, as it does.
export const REASON_MIN_LENGTH = 10;

export function meaningfulReason(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim().length >= REASON_MIN_LENGTH ? null : { reasonTooShort: true };
}
