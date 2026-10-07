import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartCard } from '../../../../shared/components/dashboard';
import { formatCedis } from '../../../../utils/donation.util';
import {
  insightCardState,
  latestDonations,
  type CompanyInsights,
  type InsightsStatus,
} from './company-insights.util';

const FEED_LENGTH = 8;

interface FeedRow {
  id: string;
  recordedAt: string;
  donor: string;
  amount: string;
  eventId: string;
  eventName: string;
}

/** The period's newest donations, each linking to the event it was given at. */
@Component({
  selector: 'app-donation-feed',
  imports: [ChartCard, DatePipe, RouterLink],
  template: `
    <app-chart-card
      title="Latest donations"
      subtitle="Newest first, this period"
      [state]="state()"
      emptyText="No donations in this period."
      errorText="Couldn't load your latest donations."
      [retryable]="true"
      (retry)="retry.emit()"
    >
      <ul class="feed-list">
        @for (row of rows(); track row.id) {
          <li class="feed-row">
            <div class="feed-main">
              <p class="t-body-em feed-donor">{{ row.donor }}</p>
              <p class="t-caption">
                <time [attr.datetime]="row.recordedAt">{{
                  row.recordedAt | date: 'd MMM, HH:mm' : 'UTC'
                }}</time>
                ·
                <a class="panel-link" [routerLink]="['/company/events', row.eventId]">{{
                  row.eventName
                }}</a>
              </p>
            </div>
            <span class="is-mono is-strong">{{ row.amount }}</span>
          </li>
        }
      </ul>
    </app-chart-card>
  `,
  styleUrl: './company-dashboard-sections.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationFeed {
  public readonly insights = input.required<CompanyInsights | null>();
  public readonly status = input.required<InsightsStatus>();
  public readonly retry = output<void>();

  protected readonly rows = computed<FeedRow[]>(() => {
    const insights = this.insights();
    if (!insights) return [];
    const names = new Map(insights.events.map((event) => [event.id, event.name]));
    return latestDonations(insights.current, FEED_LENGTH).map((donation) => ({
      id: donation.id,
      recordedAt: donation.recordedAt,
      donor: donation.donorName,
      amount: donation.amountMinor === null ? 'In-kind' : formatCedis(donation.amountMinor),
      eventId: donation.eventId,
      eventName: names.get(donation.eventId) ?? 'Event',
    }));
  });

  protected readonly state = computed(() =>
    insightCardState(this.status(), this.rows().length > 0),
  );
}
