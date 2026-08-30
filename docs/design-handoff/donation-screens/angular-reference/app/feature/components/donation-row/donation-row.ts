import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Donation, DONATION_TYPE_LABELS, formatCedis } from '../../../data/models/donation';

/**
 * One row of the donor list. Shared by the family live view and the operator's own list.
 *
 * showPhone defaults to FALSE and the family view never sets it — but the real guarantee is
 * server-side: a family-scoped query must not return donorPhone at all. A component flag
 * alone would leave the number sitting in the DOM for anyone who opened the inspector.
 */
@Component({
  selector: 'app-donation-row',
  templateUrl: './donation-row.html',
  styleUrl: './donation-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationRow {
  public donation = input.required<Donation>();
  public showPhone = input(false);
  public showRecordedBy = input(false);
  /** Marks the most recent arrival so a live list movement is legible. */
  public isNew = input(false);

  public amountLabel = computed(() => formatCedis(this.donation().amountMinor));
  public typeLabel = computed(() => DONATION_TYPE_LABELS[this.donation().donationType]);

  public subLabel = computed(() => {
    const d = this.donation();
    const parts: string[] = [this.typeLabel()];
    if (d.onBehalfOf) parts.push(d.onBehalfOf);
    if (this.showRecordedBy() && d.recordedBy) parts.push(d.recordedBy);
    if (this.showPhone() && d.donorPhone) parts.push(d.donorPhone);
    return parts.join(' · ');
  });

  public pending = computed(() => this.donation().syncStatus !== 'synced');
}
