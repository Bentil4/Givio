import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import type { Donation } from '../../../../../data/models/donation';
import { formatCedis } from '../../../../../utils/donation.util';
import { meaningfulReason } from './reason.validator';

/**
 * Confirms a soft delete and makes the Super Organizer say why — the reason is kept with the
 * record and in the activity log. Nothing is erased; the record can be restored for 30 days.
 */
@Component({
  selector: 'app-remove-donation-dialog',
  imports: [ReactiveFormsModule, CdkTrapFocus, MatIconModule],
  templateUrl: './remove-donation-dialog.html',
  styleUrl: './donation-dialogs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveDonationDialog {
  private readonly reasonInput = viewChild.required<ElementRef<HTMLTextAreaElement>>('reason');

  public readonly donation = input.required<Donation>();
  public readonly busy = input(false);
  public readonly error = input<string | null>(null);
  public readonly confirmed = output<string>();
  public readonly dismissed = output<void>();

  public readonly submitted = signal(false);
  public readonly amountLabel = computed(() => formatCedis(this.donation().amountMinor));
  public readonly form = inject(FormBuilder).nonNullable.group({
    reason: ['', meaningfulReason],
  });

  public reasonMissing(): boolean {
    return this.submitted() && this.form.invalid;
  }

  public submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.reasonInput().nativeElement.focus();
      return;
    }
    this.confirmed.emit(this.form.controls.reason.value.trim());
  }
}
