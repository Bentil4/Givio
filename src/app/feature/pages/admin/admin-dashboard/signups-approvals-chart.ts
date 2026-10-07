import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  ChartCard,
  DashboardChart,
  legendFor,
  seriesTable,
  type ChartCardState,
  type ChartSeries,
} from '../../../../shared/components/dashboard';
import type { LoadState } from './load-state';
import { formatCount, formatCountTick, type SignupsAndApprovals } from './platform-metrics';

const TITLE = 'Signups and approvals';

/** New companies against approvals per day, week or month of the period — one count axis. */
@Component({
  selector: 'app-signups-approvals-chart',
  imports: [ChartCard, DashboardChart],
  template: `
    <app-chart-card
      [title]="title"
      subtitle="Companies that signed up, and companies approved"
      [state]="cardState()"
      emptyText="No signups or approvals in this period."
      errorText="Couldn't load companies."
      [retryable]="true"
      [legend]="legend()"
      [table]="table()"
      (retry)="retry.emit()"
    >
      <app-chart
        kind="bar"
        [labels]="labels()"
        [series]="series()"
        [valueFormat]="formatCount"
        [axisFormat]="formatCountTick"
        [ariaSummary]="summary()"
      />
    </app-chart-card>
  `,
  host: { style: 'display: block; min-width: 0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupsApprovalsChart {
  public readonly state = input.required<LoadState>();
  /** One per bucket of the period, e.g. `7 Oct`. */
  public readonly labels = input.required<readonly string[]>();
  public readonly counts = input.required<SignupsAndApprovals>();
  public readonly retry = output<void>();

  protected readonly title = TITLE;
  protected readonly formatCount = formatCount;
  protected readonly formatCountTick = formatCountTick;

  protected readonly series = computed<ChartSeries[]>(() => [
    { key: 'signups', label: 'Signups', values: this.counts().signups, colorToken: '--series-1' },
    {
      key: 'approvals',
      label: 'Approvals',
      values: this.counts().approvals,
      colorToken: '--series-2',
    },
  ]);

  private readonly totals = computed(() => this.series().map((s) => sumOf(s.values)));

  protected readonly cardState = computed<ChartCardState>(() => {
    if (this.state() !== 'ready') return this.state();
    return this.totals().some((total) => total > 0) ? 'ready' : 'empty';
  });

  protected readonly legend = computed(() => legendFor(this.series()));

  protected readonly table = computed(() =>
    seriesTable({
      labels: this.labels(),
      series: this.series(),
      valueFormat: formatCount,
      labelHeading: 'Period',
    }),
  );

  protected readonly summary = computed(() => {
    const labels = this.labels();
    const [signups, approvals] = this.totals().map(formatCount);
    const span = `${labels[0]} to ${labels[labels.length - 1]}`;
    return `${TITLE}, ${span}: ${signups} signups, ${approvals} approvals.`;
  });
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
