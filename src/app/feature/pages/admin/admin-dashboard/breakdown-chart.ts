import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  ChartCard,
  DashboardChart,
  SERIES_TOKENS,
  describeSlices,
  seriesTable,
  sliceLegend,
  sliceTable,
  type ChartCardState,
  type ChartSeries,
  type ChartTable,
  type LegendItem,
} from '../../../../shared/components/dashboard';
import type { LoadState } from './load-state';
import { formatCount, formatCountTick, type CategoryCount } from './platform-metrics';

/**
 * A count per category as one chart card: bars for an ordered breakdown, a doughnut for parts
 * of a whole (at most three parts, one data-viz slot each, in order).
 */
@Component({
  selector: 'app-breakdown-chart',
  imports: [ChartCard, DashboardChart],
  template: `
    <app-chart-card
      [title]="title()"
      [subtitle]="subtitle()"
      [state]="cardState()"
      [emptyText]="emptyText()"
      [errorText]="errorText()"
      [retryable]="true"
      [legend]="legend()"
      [table]="table()"
      (retry)="retry.emit()"
    >
      <app-chart
        [kind]="kind()"
        [labels]="labels()"
        [series]="series()"
        [horizontal]="horizontal()"
        [valueFormat]="formatCount"
        [axisFormat]="formatCountTick"
        [ariaSummary]="summary()"
      />
    </app-chart-card>
  `,
  host: { style: 'display: block; min-width: 0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreakdownChart {
  public readonly title = input.required<string>();
  public readonly subtitle = input('');
  public readonly kind = input<'bar' | 'doughnut'>('bar');
  public readonly horizontal = input(false);
  public readonly items = input.required<readonly CategoryCount[]>();
  public readonly state = input.required<LoadState>();
  /** The table's first column heading, e.g. `Status`. */
  public readonly categoryHeading = input.required<string>();
  /** The bars' series name and the table's count heading, e.g. `Companies`. */
  public readonly countHeading = input.required<string>();
  public readonly emptyText = input('Nothing to show yet.');
  public readonly errorText = input("Couldn't load this chart.");
  public readonly retry = output<void>();

  protected readonly formatCount = formatCount;
  protected readonly formatCountTick = formatCountTick;
  private readonly isDoughnut = computed(() => this.kind() === 'doughnut');

  protected readonly labels = computed(() => this.items().map((item) => item.label));

  protected readonly series = computed<ChartSeries[]>(() =>
    this.isDoughnut() ? slicesOf(this.items()) : [this.barSeries()],
  );

  protected readonly cardState = computed<ChartCardState>(() => {
    if (this.state() !== 'ready') return this.state();
    return this.items().some((item) => item.count > 0) ? 'ready' : 'empty';
  });

  protected readonly legend = computed<LegendItem[]>(() =>
    this.isDoughnut() ? sliceLegend(this.series(), formatCount) : [],
  );

  protected readonly table = computed<ChartTable>(() =>
    this.isDoughnut() ? this.sliceTable() : this.barTable(),
  );

  protected readonly summary = computed(() =>
    this.isDoughnut()
      ? describeSlices(this.title(), this.series(), formatCount)
      : describeCounts(this.title(), this.items()),
  );

  private barSeries(): ChartSeries {
    const values = this.items().map((item) => item.count);
    return { key: 'count', label: this.countHeading(), values, colorToken: SERIES_TOKENS[0] };
  }

  private barTable(): ChartTable {
    return seriesTable({
      labels: this.labels(),
      series: this.series(),
      valueFormat: formatCount,
      labelHeading: this.categoryHeading(),
    });
  }

  private sliceTable(): ChartTable {
    return sliceTable({
      series: this.series(),
      valueFormat: formatCount,
      labelHeading: this.categoryHeading(),
      valueHeading: this.countHeading(),
    });
  }
}

function slicesOf(items: readonly CategoryCount[]): ChartSeries[] {
  return items.map((item, i) => ({
    key: item.key,
    label: item.label,
    values: [item.count],
    colorToken: SERIES_TOKENS[i],
  }));
}

/** e.g. `Companies by status: Active 12, Awaiting approval 3, Suspended 1, Rejected 0.` */
function describeCounts(title: string, items: readonly CategoryCount[]): string {
  const parts = items.map((item) => `${item.label} ${formatCount(item.count)}`);
  return `${title}: ${parts.join(', ')}.`;
}
