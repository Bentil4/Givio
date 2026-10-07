import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import type { Donation } from '../../../../../data/models/donation';
import { formatCedis } from '../../../../../utils/donation.util';

/** Confirms putting a soft-deleted donation back into every total, reminding why it went. */
@Component({
  selector: 'app-restore-donation-dialog',
  imports: [CdkTrapFocus],
  template: `
    <!-- Backdrop click is a pointer convenience only; (keydown.escape) is the keyboard equivalent. -->
    <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -->
    <div class="scrim" (click)="dismissed.emit()" (keydown.escape)="dismissed.emit()">
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
      <div
        class="dialog dialog--sm glass glass-thick"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="restore-donation-title"
        aria-describedby="restore-donation-body"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        (click)="$event.stopPropagation()"
      >
        <header class="dialog-head">
          <h2 id="restore-donation-title" class="t-page-title">
            Restore {{ donation().receiptNumber }}?
          </h2>
          <p class="t-secondary">{{ donation().donorName }} · {{ amountLabel() }}</p>
        </header>
        <div class="dialog-body">
          <p id="restore-donation-body" class="t-body confirm-body">
            It counts toward the totals again, appears in exports, and is visible to the family on
            the live view.
          </p>
          @if (donation().deletionReason; as reason) {
            <div class="reason-recall">
              <span class="sub-label">It was removed because</span>
              <p class="t-caption">{{ reason }}</p>
            </div>
          }
          @if (error(); as message) {
            <p class="field-error" role="alert">{{ message }}</p>
          }
        </div>
        <footer class="dialog-foot">
          <button type="button" class="btn btn-secondary" (click)="dismissed.emit()">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="busy()"
            (click)="confirmed.emit()"
          >
            Restore donation
          </button>
        </footer>
      </div>
    </div>
  `,
  styleUrl: './donation-dialogs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestoreDonationDialog {
  public readonly donation = input.required<Donation>();
  public readonly busy = input(false);
  public readonly error = input<string | null>(null);
  public readonly confirmed = output<void>();
  public readonly dismissed = output<void>();

  public readonly amountLabel = computed(() => formatCedis(this.donation().amountMinor));
}
