import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DONATION_TYPE_LABELS, type Donation } from '../../../../data/models/donation';
import { SkeletonRows } from '../../../../shared/components/skeleton-rows/skeleton-rows';
import { formatCedis } from '../../../../utils/donation.util';
import { SETTLEMENT_TIME_ZONE } from '../../../../utils/settlement-period.util';
import type { OperatorDataState } from './operator-insights.util';

interface RecentDonationRow {
  id: string;
  donor: string;
  receipt: string;
  type: string;
  amount: string;
  recordedAt: string;
  time: string;
  pending: boolean;
}

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: SETTLEMENT_TIME_ZONE,
};

/** The Operator's latest recordings, so "did my last entry save?" is answered at a glance. */
@Component({
  selector: 'app-my-recent-donations',
  imports: [RouterLink, SkeletonRows],
  templateUrl: './my-recent-donations.html',
  styleUrl: './my-recent-donations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyRecentDonations {
  /** Already the newest few, newest first. */
  public readonly donations = input.required<readonly Donation[]>();
  public readonly state = input.required<OperatorDataState>();
  public readonly emptyText = input.required<string>();
  public readonly retry = output<void>();

  protected readonly rows = computed(() => this.donations().map(toRow));
}

function toRow(donation: Donation): RecentDonationRow {
  return {
    id: donation.id,
    donor: donation.donorName,
    receipt: donation.receiptNumber,
    type: DONATION_TYPE_LABELS[donation.donationType],
    amount: donation.amountMinor === null ? 'In-kind' : formatCedis(donation.amountMinor),
    recordedAt: donation.recordedAt,
    time: new Date(donation.recordedAt).toLocaleString('en-GB', TIME_FORMAT),
    pending: donation.syncStatus !== 'synced',
  };
}
