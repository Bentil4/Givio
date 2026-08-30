import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DonationDraft, DonationType, DONATION_TYPE_LABELS } from '../../../data/models/donation';

/**
 * The six-field entry form. Emits a validated DonationDraft; it does not know or care
 * whether the caller will POST it or queue it in IndexedDB — that is exactly why the
 * offline path needs no second form.
 *
 * Validation runs on blur, not per keystroke. An operator typing a name at a funeral
 * door does not need to be told it is too short after one letter.
 */
@Component({
  selector: 'app-donation-form',
  imports: [ReactiveFormsModule],
  templateUrl: './donation-form.html',
  styleUrl: './donation-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationForm {
  public eventId = input.required<string>();
  public receiptNumber = input<string>('');
  /** Changes the save button's wording, nothing else. The form itself is identical offline. */
  public offline = input(false);
  public busy = input(false);

  public submitted = output<DonationDraft>();
  public cleared = output<void>();

  private readonly fb = inject(FormBuilder);

  public readonly types: { value: DonationType; label: string }[] =
    (Object.keys(DONATION_TYPE_LABELS) as DonationType[]).map((value) => ({
      value,
      label: DONATION_TYPE_LABELS[value],
    }));

  public readonly form = this.fb.nonNullable.group({
    donorName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    amount: ['', [Validators.pattern(/^\d{1,7}(\.\d{1,2})?$/)]],
    donationType: ['cash' as DonationType, Validators.required],
    onBehalfOf: ['', Validators.maxLength(120)],
    donorPhone: ['', Validators.pattern(/^0[2345]\d{8}$/)],
    notes: ['', Validators.maxLength(500)],
  });

  private readonly typeSignal = signal<DonationType>('cash');

  /** In-kind gifts have no cash amount, so requiring one would force operators to invent numbers. */
  public readonly amountRequired = computed(() => this.typeSignal() !== 'in_kind');

  constructor() {
    this.form.controls.donationType.valueChanges.subscribe((t) => this.typeSignal.set(t));

    effect(() => {
      const amount = this.form.controls.amount;
      const required = this.amountRequired();
      const validators = [Validators.pattern(/^\d{1,7}(\.\d{1,2})?$/)];
      if (required) validators.push(Validators.required, Validators.min(0.01));
      amount.setValidators(validators);
      amount.updateValueAndValidity({ emitEvent: false });
    });
  }

  public selectType(type: DonationType): void {
    this.form.controls.donationType.setValue(type);
  }

  public isInvalid(control: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  public submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();

    this.submitted.emit({
      // crypto.randomUUID gives the offline queue a stable key before any server round-trip,
      // which is what makes a queued record survive a reload and stay de-duplicable on sync.
      localId: crypto.randomUUID(),
      eventId: this.eventId(),
      donorName: v.donorName.trim(),
      amountMinor: v.amount ? Math.round(parseFloat(v.amount) * 100) : null,
      donationType: v.donationType,
      onBehalfOf: v.onBehalfOf.trim() || undefined,
      donorPhone: v.donorPhone.trim() || undefined,
      notes: v.notes.trim() || undefined,
    });
  }

  public clear(): void {
    this.form.reset({ donationType: 'cash' });
    this.cleared.emit();
  }
}
