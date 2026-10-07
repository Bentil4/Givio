import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  ChartCard,
  DashboardChart,
  SERIES_TOKENS,
  describeSlices,
  describeTrend,
  seriesTable,
  sliceLegend,
  sliceTable,
  type ChartSeries,
} from '../../../../shared/components/dashboard';
import { raisedSeries, typeSeries } from '../../../../utils/donation-insights.util';
import { formatCedis } from '../../../../utils/donation.util';
import {
  insightCardState,
  type CompanyInsights,
  type InsightsStatus,
} from './company-insights.util';
import { countLabel } from './company-totals.util';

const RAISED_TITLE = 'Raised over time';
const TYPE_TITLE = 'By donation type';
const NO_DONATIONS = 'No donations in this period.';
const LOAD_ERROR = "Couldn't load your donations.";

const giftCount = (count: number) => countLabel(count, 'gift');

/** How the period's money arrived over time, and how its gifts split by type. */
@Component({
  selector: 'app-company-trend-charts',
  imports: [ChartCard, DashboardChart],
  template: `
    <app-chart-card
      [title]="raisedTitle"
      subtitle="Cash and mobile money"
      [state]="raisedState()"
      [emptyText]="noDonations"
      [errorText]="loadError"
      [retryable]="true"
      [table]="raisedTable()"
      (retry)="retry.emit()"
    >
      <app-chart
        kind="line"
        [labels]="raisedLabels()"
        [series]="raised()"
        [ariaSummary]="raisedSummary()"
      />
    </app-chart-card>

    <app-chart-card
      [title]="typeTitle"
      subtitle="Number of gifts, in-kind included"
      [state]="typeState()"
      [emptyText]="noDonations"
      [errorText]="loadError"
      [retryable]="true"
      [legend]="typeLegend()"
      [table]="typeTable()"
      (retry)="retry.emit()"
    >
      <app-chart
        kind="doughnut"
        [series]="types()"
        [valueFormat]="giftCount"
        [ariaSummary]="typeSummary()"
      />
    </app-chart-card>
  `,
  styleUrl: './company-dashboard-sections.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyTrendCharts {
  public readonly insights = input.required<CompanyInsights | null>();
  public readonly status = input.required<InsightsStatus>();
  public readonly retry = output<void>();

  protected readonly raisedTitle = RAISED_TITLE;
  protected readonly typeTitle = TYPE_TITLE;
  protected readonly noDonations = NO_DONATIONS;
  protected readonly loadError = LOAD_ERROR;
  protected readonly giftCount = giftCount;

  private readonly current = computed(() => this.insights()?.current ?? []);
  private readonly hasDonations = computed(() => this.current().length > 0);

  protected readonly raisedLabels = computed(() =>
    (this.insights()?.window.buckets ?? []).map((bucket) => bucket.label),
  );
  protected readonly raised = computed<ChartSeries[]>(() => [
    {
      key: 'raised',
      label: 'Raised',
      values: raisedSeries(this.current(), this.insights()?.window.buckets ?? []),
      colorToken: SERIES_TOKENS[0],
    },
  ]);
  protected readonly raisedState = computed(() =>
    insightCardState(this.status(), this.hasDonations()),
  );
  protected readonly raisedTable = computed(() =>
    seriesTable({
      labels: this.raisedLabels(),
      series: this.raised(),
      valueFormat: formatCedis,
      labelHeading: 'Period',
    }),
  );
  protected readonly raisedSummary = computed(() =>
    describeTrend({
      title: RAISED_TITLE,
      labels: this.raisedLabels(),
      values: this.raised()[0].values,
      valueFormat: formatCedis,
    }),
  );

  protected readonly types = computed(() => typeSeries(this.current(), 'count'));
  protected readonly typeState = computed(() =>
    insightCardState(this.status(), this.hasDonations()),
  );
  protected readonly typeLegend = computed(() => sliceLegend(this.types(), giftCount));
  protected readonly typeTable = computed(() =>
    sliceTable({
      series: this.types(),
      valueFormat: giftCount,
      labelHeading: 'Type',
      valueHeading: 'Gifts',
    }),
  );
  protected readonly typeSummary = computed(() =>
    describeSlices(TYPE_TITLE, this.types(), giftCount),
  );
}
