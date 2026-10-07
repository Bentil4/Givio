import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ChartCard,
  DashboardChart,
  SERIES_TOKENS,
  seriesTable,
  type ChartSeries,
} from '../../../../shared/components/dashboard';
import {
  raisedByRecorder,
  topEventsByRaised,
  type RankedTotal,
} from '../../../../utils/donation-insights.util';
import { formatCedis } from '../../../../utils/donation.util';
import {
  insightCardState,
  type CompanyInsights,
  type InsightsStatus,
} from './company-insights.util';

const EVENTS_TITLE = 'Top events by raised';
const TEAM_TITLE = 'Team performance';
const TOP_EVENTS = 5;
const TOP_RECORDERS = 8;

/** Which events and which team members brought in the period's money, largest first. */
@Component({
  selector: 'app-company-ranking-charts',
  imports: [ChartCard, DashboardChart, RouterLink],
  template: `
    <app-chart-card
      [title]="eventsTitle"
      subtitle="Top 5 this period"
      [state]="eventsState()"
      emptyText="No event has recorded a donation in this period."
      errorText="Couldn't load your events' totals."
      [retryable]="true"
      [table]="eventsTable()"
      (retry)="retry.emit()"
    >
      <app-chart
        kind="bar"
        [horizontal]="true"
        [labels]="eventLabels()"
        [series]="eventSeries()"
        [ariaSummary]="eventsSummary()"
      />
      <ul class="rank-links" aria-label="Open a top event">
        @for (event of topEvents(); track event.id) {
          <li>
            <a class="panel-link" [routerLink]="['/company/events', event.id]">{{ event.label }}</a>
          </li>
        }
      </ul>
    </app-chart-card>

    <app-chart-card
      [title]="teamTitle"
      [subtitle]="teamSubtitle()"
      [state]="teamState()"
      emptyText="No one has recorded a donation in this period."
      errorText="Couldn't load your team's totals."
      [retryable]="true"
      [table]="teamTable()"
      (retry)="retry.emit()"
    >
      <app-chart
        kind="bar"
        [horizontal]="true"
        [labels]="recorderLabels()"
        [series]="recorderSeries()"
        [ariaSummary]="teamSummary()"
      />
    </app-chart-card>
  `,
  styleUrl: './company-dashboard-sections.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyRankingCharts {
  public readonly insights = input.required<CompanyInsights | null>();
  public readonly status = input.required<InsightsStatus>();
  public readonly recorderNames = input.required<ReadonlyMap<string, string>>();
  public readonly recorderNamesMissing = input(false);
  public readonly retry = output<void>();

  protected readonly eventsTitle = EVENTS_TITLE;
  protected readonly teamTitle = TEAM_TITLE;

  protected readonly topEvents = computed(() => {
    const insights = this.insights();
    return insights ? topEventsByRaised(insights.current, insights.events, TOP_EVENTS) : [];
  });
  protected readonly eventLabels = computed(() => labelsOf(this.topEvents()));
  protected readonly eventSeries = computed(() => raisedSeriesOf(this.topEvents()));
  protected readonly eventsState = computed(() =>
    insightCardState(this.status(), this.topEvents().length > 0),
  );
  protected readonly eventsTable = computed(() => rankingTable(this.topEvents(), 'Event'));
  protected readonly eventsSummary = computed(() => rankingSummary(EVENTS_TITLE, this.topEvents()));

  protected readonly recorders = computed(() => {
    const names = this.recorderNames();
    const current = this.insights()?.current ?? [];
    return raisedByRecorder(current, (id) => names.get(id), TOP_RECORDERS);
  });
  protected readonly recorderLabels = computed(() => labelsOf(this.recorders()));
  protected readonly recorderSeries = computed(() => raisedSeriesOf(this.recorders()));
  protected readonly teamState = computed(() =>
    insightCardState(this.status(), this.recorders().length > 0),
  );
  protected readonly teamTable = computed(() => rankingTable(this.recorders(), 'Recorded by'));
  protected readonly teamSummary = computed(() => rankingSummary(TEAM_TITLE, this.recorders()));
  protected readonly teamSubtitle = computed(() =>
    this.recorderNamesMissing()
      ? "Amount each person recorded · names couldn't load"
      : 'Amount each person recorded',
  );
}

function labelsOf(ranked: readonly RankedTotal[]): string[] {
  return ranked.map((total) => total.label);
}

function raisedSeriesOf(ranked: readonly RankedTotal[]): ChartSeries[] {
  const values = ranked.map((total) => total.totalMinor);
  return [{ key: 'raised', label: 'Raised', values, colorToken: SERIES_TOKENS[0] }];
}

function rankingTable(ranked: readonly RankedTotal[], labelHeading: string) {
  return seriesTable({
    labels: labelsOf(ranked),
    series: raisedSeriesOf(ranked),
    valueFormat: formatCedis,
    labelHeading,
  });
}

/** e.g. `Top events by raised: Odoi Funeral GH₵ 500.00, Mensah Wedding GH₵ 25.50.` */
function rankingSummary(title: string, ranked: readonly RankedTotal[]): string {
  const parts = ranked.map((total) => `${total.label} ${formatCedis(total.totalMinor)}`);
  return parts.length ? `${title}: ${parts.join(', ')}.` : `${title}: no data.`;
}
