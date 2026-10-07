import { _IdGenerator } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { SkeletonRows } from '../skeleton-rows/skeleton-rows';
import { ChartLegend } from './chart-legend';
import type { ChartCardState, ChartTable, LegendItem } from './chart.models';

/**
 * A titled chart panel: legend, loading / empty / error states and a "View as table" toggle,
 * the accessible equivalent of the projected chart. The chart stays mounted while hidden, so
 * toggling or reloading never rebuilds it.
 *
 * e.g. `<app-chart-card title="…" [state]="…" [table]="…"><app-chart …/></app-chart-card>`
 * Anything marked `chartCardActions` is projected into the header, e.g. a "View all" link.
 */
@Component({
  selector: 'app-chart-card',
  imports: [SkeletonRows, ChartLegend],
  templateUrl: './chart-card.html',
  styleUrl: './chart-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartCard {
  public readonly title = input.required<string>();
  public readonly subtitle = input('');
  public readonly state = input<ChartCardState>('ready');
  public readonly emptyText = input('Nothing to show for this period yet.');
  public readonly errorText = input("Couldn't load this chart.");
  /** Shows a "Try again" button in the error state, which emits `retry`. */
  public readonly retryable = input(false);
  /** Rendered as an HTML legend when it has two or more items. */
  public readonly legend = input<readonly LegendItem[]>([]);
  public readonly table = input<ChartTable | null>(null);
  public readonly retry = output<void>();

  protected readonly titleId = inject(_IdGenerator).getId('app-chart-card-title-');
  private readonly tableRequested = signal(false);
  protected readonly isReady = computed(() => this.state() === 'ready');
  protected readonly hasTable = computed(() => (this.table()?.rows.length ?? 0) > 0);
  protected readonly canToggleTable = computed(() => this.isReady() && this.hasTable());
  protected readonly showTable = computed(() => this.canToggleTable() && this.tableRequested());
  protected readonly showPlot = computed(() => this.isReady() && !this.showTable());
  protected readonly showLegend = computed(() => this.isReady() && this.legend().length > 1);

  protected toggleTable(): void {
    this.tableRequested.set(!this.showTable());
  }
}
