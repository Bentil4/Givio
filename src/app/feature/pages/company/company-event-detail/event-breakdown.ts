import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Donation } from '../../../../data/models/donation';
import {
  ChartCard,
  DashboardChart,
  KpiTile,
  describeSlices,
  sliceLegend,
  sliceTable,
  type ChartCardState,
} from '../../../../shared/components/dashboard';
import { donationStats } from '../../../../utils/donation-breakdown.util';
import { typeSeries } from '../../../../utils/donation-insights.util';
import { countedDonations, formatCedis } from '../../../../utils/donation.util';

const TYPE_CHART_TITLE = 'By donation type';

/**
 * One Event's headline figures and its split by donation type, from the same counting rule as
 * every other total — removed, in-conflict and rejected records are left out.
 */
@Component({
  selector: 'app-event-breakdown',
  imports: [KpiTile, ChartCard, DashboardChart],
  template: `
    <ul class="stat-grid" aria-label="Event figures">
      @for (s of stats(); track s.key) {
        <li><app-kpi-tile [label]="s.key" [value]="s.value" [hint]="s.sub" /></li>
      }
    </ul>

    <app-chart-card
      [title]="typeChartTitle"
      [state]="typeState()"
      emptyText="No cash or mobile money given yet."
      [legend]="typeLegend()"
      [table]="typeTable()"
    >
      <app-chart kind="doughnut" [series]="types()" [ariaSummary]="typeSummary()" />
    </app-chart-card>
  `,
  styleUrl: './event-breakdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventBreakdown {
  public readonly donations = input.required<readonly Donation[]>();
  public readonly dateLabel = input('');

  protected readonly typeChartTitle = TYPE_CHART_TITLE;
  private readonly counted = computed(() => countedDonations(this.donations()));
  public readonly stats = computed(() => donationStats(this.counted(), this.dateLabel()));
  protected readonly types = computed(() => typeSeries(this.counted()));
  protected readonly typeState = computed<ChartCardState>(() =>
    this.types().some((slice) => slice.values[0] > 0) ? 'ready' : 'empty',
  );
  protected readonly typeLegend = computed(() => sliceLegend(this.types(), formatCedis));
  protected readonly typeSummary = computed(() =>
    describeSlices(TYPE_CHART_TITLE, this.types(), formatCedis),
  );
  protected readonly typeTable = computed(() =>
    sliceTable({
      series: this.types(),
      valueFormat: formatCedis,
      labelHeading: 'Type',
      valueHeading: 'Raised',
    }),
  );
}
