import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  type AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import type {
  RevocationChoice,
  RevocationReason,
  TeamMember,
} from '../../../../../data/models/team-member';

// The Function's own cap (validation.js) — it refuses anything longer regardless.
const EXPLANATION_MAX = 500;

function explanationRequiredForCause(group: AbstractControl): ValidationErrors | null {
  const { reason, explanation } = group.value as { reason: string; explanation: string };
  return reason === 'for_cause' && explanation.trim() === '' ? { explanationRequired: true } : null;
}

/**
 * Story 7.3 (FR-13/FR-24): confirms a revoke and makes the revoker say which kind it is —
 * routine offboarding or for-cause, which also needs an explanation for Givio's review. Emits
 * the choice; the page sends it.
 */
@Component({
  selector: 'app-revoke-member-dialog',
  imports: [ReactiveFormsModule, CdkTrapFocus],
  templateUrl: './revoke-member-dialog.html',
  styleUrl: './revoke-member-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevokeMemberDialog {
  private readonly fb = inject(FormBuilder);
  private readonly firstReason = viewChild.required<ElementRef<HTMLInputElement>>('firstReason');
  private readonly explanationInput =
    viewChild<ElementRef<HTMLTextAreaElement>>('explanationInput');

  public readonly member = input.required<TeamMember>();
  public readonly companyName = input.required<string>();
  public readonly busy = input(false);
  public readonly confirmed = output<RevocationChoice>();
  public readonly dismissed = output<void>();

  public readonly explanationMax = EXPLANATION_MAX;
  public readonly submitted = signal(false);

  public readonly form = this.fb.nonNullable.group(
    {
      reason: ['' as RevocationReason | '', Validators.required],
      explanation: ['', Validators.maxLength(EXPLANATION_MAX)],
    },
    { validators: explanationRequiredForCause },
  );

  public isForCause(): boolean {
    return this.form.controls.reason.value === 'for_cause';
  }

  public reasonMissing(): boolean {
    return this.submitted() && this.form.controls.reason.invalid;
  }

  public explanationMissing(): boolean {
    return this.submitted() && this.form.hasError('explanationRequired');
  }

  public submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.focusFirstError();
      return;
    }
    this.confirmed.emit(this.choice());
  }

  private focusFirstError(): void {
    const field = this.reasonMissing() ? this.firstReason() : this.explanationInput();
    field?.nativeElement.focus();
  }

  private choice(): RevocationChoice {
    const { reason, explanation } = this.form.getRawValue();
    return reason === 'for_cause'
      ? { reason, explanation: explanation.trim() }
      : { reason: 'routine' };
  }
}
