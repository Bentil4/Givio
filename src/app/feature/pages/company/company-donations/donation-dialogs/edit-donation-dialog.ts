import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  DONATION_TYPE_LABELS,
  type Donation,
  type DonationCorrection,
  type DonationType,
} from '../../../../../data/models/donation';
import { meaningfulReason } from './reason.validator';

export interface DonationEdit {
  patch: DonationCorrection;
  reason: string;
}

const DONATION_TYPES: readonly DonationType[] = ['cash', 'mobile_money', 'in_kind'];

// The validated fields, in screen order, with the input each one's error is announced on.
const FIELD_INPUT_IDS = {
  amount: 'editDonationAmount',
  donorName: 'editDonationDonor',
  reason: 'editDonationReason',
} as const;

type ValidatedField = keyof typeof FIELD_INPUT_IDS;

/**
 * A Super Organizer's correction to one donation — the same four fields and the same rules as
 * Admin's: a donor name of at least 2 characters, an amount in cedis, and a reason, which is
 * what makes a changed total defensible later. Emits the correction; the page sends it.
 */
@Component({
  selector: 'app-edit-donation-dialog',
  imports: [ReactiveFormsModule, CdkTrapFocus, DatePipe],
  templateUrl: './edit-donation-dialog.html',
  styleUrl: './donation-dialogs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditDonationDialog implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  public readonly donation = input.required<Donation>();
  public readonly recorderName = input.required<string>();
  public readonly busy = input(false);
  public readonly error = input<string | null>(null);
  public readonly saved = output<DonationEdit>();
  public readonly dismissed = output<void>();

  public readonly submitted = signal(false);
  public readonly types = DONATION_TYPES;
  public readonly labels = DONATION_TYPE_LABELS;

  public readonly form = this.fb.nonNullable.group({
    donorName: ['', [Validators.required, Validators.minLength(2)]],
    amount: ['', Validators.pattern(/^\d{1,7}(\.\d{1,2})?$/)],
    donationType: ['cash' as DonationType, Validators.required],
    onBehalfOf: [''],
    reason: ['', meaningfulReason],
  });

  ngOnInit(): void {
    const d = this.donation();
    this.form.reset({
      donorName: d.donorName,
      amount: d.amountMinor === null ? '' : (d.amountMinor / 100).toFixed(2),
      donationType: d.donationType,
      onBehalfOf: d.onBehalfOf ?? '',
      reason: '',
    });
  }

  public showError(control: ValidatedField): boolean {
    return this.submitted() && this.form.controls[control].invalid;
  }

  public submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.focusFirstInvalidField();
      return;
    }
    this.saved.emit(this.correction());
  }

  private focusFirstInvalidField(): void {
    const fields = Object.keys(FIELD_INPUT_IDS) as ValidatedField[];
    const field = fields.find((name) => this.form.controls[name].invalid);
    if (field) {
      this.host.nativeElement.querySelector<HTMLElement>(`#${FIELD_INPUT_IDS[field]}`)?.focus();
    }
  }

  private correction(): DonationEdit {
    const v = this.form.getRawValue();
    return {
      patch: {
        donorName: v.donorName.trim(),
        amountMinor: v.amount ? Math.round(parseFloat(v.amount) * 100) : null,
        donationType: v.donationType,
        onBehalfOf: v.onBehalfOf.trim() || null,
      },
      reason: v.reason.trim(),
    };
  }
}
