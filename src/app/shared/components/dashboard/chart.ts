import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { ThemeService } from '../../../core/services/theme.service';
import { formatCedis, formatCedisShort } from '../../../utils/donation.util';
import { buildChartConfig, type ChartSpec } from './chart-config';
import { prefersReducedMotion, resolveChartPalette } from './chart-palette';
import { CHART_FACTORY, type ChartHandle, type DashboardChartConfig } from './chart-registry';
import type { ChartKind, ChartSeries } from './chart.models';

/**
 * A Chart.js canvas behind one accessible name. The canvas is opaque to assistive technology,
 * so `ariaSummary` carries what it shows, and app-chart-card adds the table view. Height comes
 * from the `--chart-height` custom property (240px, or 40px when compact).
 */
@Component({
  selector: 'app-chart',
  template: `
    <div class="chart-frame" role="img" [attr.aria-label]="ariaSummary()">
      <canvas #canvas></canvas>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .chart-frame {
      position: relative;
      height: var(--chart-height, 240px);
    }

    :host(.is-compact) .chart-frame {
      height: var(--chart-height, 40px);
    }
  `,
  host: { '[class.is-compact]': 'compact()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardChart {
  public readonly kind = input.required<ChartKind>();
  /** One per x-axis step; unused by a doughnut, whose arcs are its series. */
  public readonly labels = input<readonly string[]>([]);
  public readonly series = input.required<readonly ChartSeries[]>();
  /** Tooltip values. Defaults to cedis from minor units. */
  public readonly valueFormat = input<(value: number) => string>(formatCedis);
  /** Value-axis ticks — shorter than tooltip values. Defaults to whole cedis. */
  public readonly axisFormat = input<(value: number) => string>(formatCedisShort);
  /** Bars run left to right, for long category names such as event titles. */
  public readonly horizontal = input(false);
  /** A sparkline: no axes, tooltips or hover. */
  public readonly compact = input(false);
  public readonly ariaSummary = input.required<string>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly createChart = inject(CHART_FACTORY);
  private readonly theme = inject(ThemeService).theme;
  private chart: ChartHandle | null = null;

  private readonly spec = computed<Omit<ChartSpec, 'animate'>>(() => ({
    kind: this.kind(),
    labels: this.labels(),
    series: this.series(),
    valueFormat: this.valueFormat(),
    axisFormat: this.axisFormat(),
    horizontal: this.horizontal(),
    compact: this.compact(),
  }));

  constructor() {
    afterRenderEffect(() => {
      this.theme(); // a theme switch changes the custom properties the palette is read from
      this.render({ ...this.spec(), animate: !prefersReducedMotion() });
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }

  private render(spec: ChartSpec): void {
    const tokens = spec.series.map((series) => series.colorToken);
    const config = buildChartConfig(spec, resolveChartPalette(this.host.nativeElement, tokens));
    if (this.chart?.config.type === config.type) {
      this.updateChart(this.chart, config);
      return;
    }
    this.chart?.destroy();
    this.chart = this.createChart(this.canvas().nativeElement, config);
  }

  // Updating in place, rather than re-creating, keeps a live total from replaying its entrance.
  private updateChart(chart: ChartHandle, config: DashboardChartConfig): void {
    chart.data = config.data;
    chart.options = config.options;
    chart.update();
  }
}
