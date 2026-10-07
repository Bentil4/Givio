import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EVENT_STATUS_CHIP } from '../../../../data/models/event';
import { ChartCard } from '../../../../shared/components/dashboard';
import { statusLabel } from '../company-events/event-status-actions';
import {
  insightCardState,
  upcomingEvents,
  type CompanyInsights,
  type InsightsStatus,
} from './company-insights.util';

const UPCOMING_COUNT = 3;

/** The next running events by date, so the week ahead is one glance away. */
@Component({
  selector: 'app-upcoming-events',
  imports: [ChartCard, DatePipe, RouterLink],
  template: `
    <app-chart-card
      title="Upcoming events"
      [state]="state()"
      emptyText="No running events are coming up."
      errorText="Couldn't load your events."
      [retryable]="true"
      (retry)="retry.emit()"
    >
      <a chartCardActions class="panel-link" routerLink="/company/events">All events</a>
      <ul class="feed-list">
        @for (event of events(); track event.id) {
          <li class="feed-row">
            <div class="feed-main">
              <a class="t-body-em event-link" [routerLink]="['/company/events', event.id]">{{
                event.name
              }}</a>
              <p class="t-caption">
                <time [attr.datetime]="event.date">{{
                  event.date | date: 'EEE d MMM' : 'UTC'
                }}</time>
                @if (event.venue) {
                  · {{ event.venue }}
                }
              </p>
            </div>
            <span class="tag" [class]="chipClass[event.status]">{{ label(event.status) }}</span>
          </li>
        }
      </ul>
    </app-chart-card>
  `,
  styleUrl: './company-dashboard-sections.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpcomingEvents {
  public readonly insights = input.required<CompanyInsights | null>();
  public readonly status = input.required<InsightsStatus>();
  public readonly retry = output<void>();

  protected readonly chipClass = EVENT_STATUS_CHIP;
  protected readonly label = statusLabel;

  // "Upcoming" counts from the day of the read, which is where every period range ends.
  protected readonly events = computed(() => {
    const insights = this.insights();
    if (!insights) return [];
    return upcomingEvents(insights.events, new Date(insights.window.range.end), UPCOMING_COUNT);
  });

  protected readonly state = computed(() =>
    insightCardState(this.status(), this.events().length > 0),
  );
}
