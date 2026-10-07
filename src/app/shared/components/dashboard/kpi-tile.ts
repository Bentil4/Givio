import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { KpiDelta } from '../../../utils/trend.util';
import { DashboardChart } from './chart';
import type { ChartSeries } from './chart.models';
import { describeDelta, type GoodDirection } from './kpi-delta';

/**
 * One headline figure: its value, its change against the previous period (icon + words, colour
 * only supporting), a hint line, an optional sparkline and an optional link to the detail.
 * Projected content sits under the hint, e.g. a status against a target.
 */
@Component({
  selector: 'app-kpi-tile',
  imports: [MatIconModule, RouterLink, DashboardChart],
  templateUrl: './kpi-tile.html',
  styleUrl: './kpi-tile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiTile {
  public readonly label = input.required<string>();
  /** Already formatted, e.g. `GH₵ 4,200` or `12`. */
  public readonly value = input.required<string>();
  public readonly delta = input<KpiDelta | null>(null);
  /** Which way is good news; a rise in pending approvals is not. */
  public readonly goodDirection = input<GoodDirection>('up');
  public readonly hint = input('');
  public readonly link = input<string | (string | number)[] | null>(null);
  public readonly linkLabel = input('View details');
  /** One value per step, oldest first; drawn as a small line in series slot 1. */
  public readonly sparkline = input<readonly number[]>([]);
  public readonly loading = input(false);
  /** Warning adds an icon and a warning edge; the hint should say why in words. */
  public readonly tone = input<'default' | 'warning'>('default');

  protected readonly deltaView = computed(() => {
    const delta = this.delta();
    return delta ? describeDelta(delta, this.goodDirection()) : null;
  });

  protected readonly sparkLabels = computed(() => this.sparkline().map((_, i) => String(i + 1)));

  protected readonly sparkSeries = computed<ChartSeries[]>(() => [
    { key: 'trend', label: this.label(), values: this.sparkline(), colorToken: '--series-1' },
  ]);
}
