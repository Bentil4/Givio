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
  type ChartCardState,
  type ChartSeries,
} from '../../../../shared/components/dashboard';
import { typeSeries } from '../../../../utils/donation-insights.util';
import { formatCedis } from '../../../../utils/donation.util';
import {
  donationsForPeriod,
  hourlyChart,
  type OperatorInsightSource,
} from './operator-insights.util';

const TYPE_CHART_TITLE = 'By donation type';

const LOAD_ERROR = "Couldn't load the donations on this device.";

/** "1 gift", "12 gifts" — in-kind gifts carry no amount, so types compare by count. */
export function formatGifts(count: number): string {
  return count === 1 ? '1 gift' : `${count.toLocaleString('en-GH')} gifts`;
}

/** The hourly pace (or busiest hours) and the split by donation type, each with a table view. */
@Component({
  selector: 'app-operator-charts',
  imports: [ChartCard, DashboardChart],
  template: `
    <app-chart-card
      [title]="hourly().title"
      [subtitle]="hourly().subtitle"
      [state]="state()"
      [emptyText]="emptyText()"
      [errorText]="loadError"
      [retryable]="true"
      [table]="hourlyTable()"
      (retry)="retry.emit()"
    >
      <app-chart
        kind="bar"
        [labels]="hourly().labels"
        [series]="hourlySeries()"
        [ariaSummary]="hourlySummary()"
      />
    </app-chart-card>

    <app-chart-card
      [title]="typeChartTitle"
      subtitle="Number of gifts, in-kind included"
      [state]="state()"
      [emptyText]="emptyText()"
      [errorText]="loadError"
      [retryable]="true"
      [legend]="typeLegend()"
      [table]="typeTable()"
      (retry)="retry.emit()"
    >
      <app-chart
        kind="doughnut"
        [series]="types()"
        [valueFormat]="formatGifts"
        [ariaSummary]="typeSummary()"
      />
    </app-chart-card>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperatorCharts {
  public readonly source = input.required<OperatorInsightSource>();
  public readonly state = input.required<ChartCardState>();
  public readonly emptyText = input.required<string>();
  public readonly retry = output<void>();

  protected readonly typeChartTitle = TYPE_CHART_TITLE;
  protected readonly loadError = LOAD_ERROR;
  protected readonly formatGifts = formatGifts;

  protected readonly hourly = computed(() => hourlyChart(this.source()));
  protected readonly hourlySeries = computed<ChartSeries[]>(() => [
    { key: 'raised', label: 'Raised', values: this.hourly().values, colorToken: SERIES_TOKENS[0] },
  ]);
  protected readonly hourlyTable = computed(() =>
    seriesTable({
      labels: this.hourly().labels,
      series: this.hourlySeries(),
      valueFormat: formatCedis,
      labelHeading: 'Hour',
    }),
  );
  protected readonly hourlySummary = computed(() =>
    describeTrend({ ...this.hourly(), valueFormat: formatCedis }),
  );

  protected readonly types = computed(() => typeSeries(donationsForPeriod(this.source()), 'count'));
  protected readonly typeLegend = computed(() => sliceLegend(this.types(), formatGifts));
  protected readonly typeTable = computed(() =>
    sliceTable({
      series: this.types(),
      valueFormat: formatGifts,
      labelHeading: 'Type',
      valueHeading: 'Gifts',
    }),
  );
  protected readonly typeSummary = computed(() =>
    describeSlices(TYPE_CHART_TITLE, this.types(), formatGifts),
  );
}
