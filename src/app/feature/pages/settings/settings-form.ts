import { signal } from '@angular/core';
import type { AbstractControl, FormGroup } from '@angular/forms';
import { ServiceError } from '../../../core/services/service-error';

/** Every Settings form saves on its own: its own busy flag, error and success message. */
export class SaveState {
  public readonly saving = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly success = signal<string | null>(null);

  /** Resolves true when the save went through. */
  async run(save: () => Promise<void>, successMessage: string): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      await save();
      this.success.set(successMessage);
      return true;
    } catch (err) {
      this.error.set(err instanceof ServiceError ? err.message : "Couldn't save. Try again.");
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}

/**
 * Guards a submit: refuses while a save is in flight, and on invalid input marks every field
 * touched (so its error shows) and moves focus to the first invalid one.
 */
export function readyToSave(form: FormGroup, state: SaveState, formElement: HTMLElement): boolean {
  if (state.saving()) return false;
  if (form.valid) return true;
  form.markAllAsTouched();
  focusFirstInvalidControl(form, formElement);
  return false;
}

// Read from the controls, not the ng-invalid class, which lags until the next change detection.
function focusFirstInvalidControl(form: FormGroup, formElement: HTMLElement): void {
  const name = Object.keys(form.controls).find((key) => form.controls[key].invalid);
  formElement.querySelector<HTMLElement>(`[formcontrolname="${name}"]`)?.focus();
}

export function showsError(control: AbstractControl): boolean {
  return control.invalid && control.touched;
}
