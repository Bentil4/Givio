import { InjectionToken } from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';

export type DashboardChartConfig =
  ChartConfiguration<'line'> | ChartConfiguration<'bar'> | ChartConfiguration<'doughnut'>;

/** The part of a Chart.js instance app-chart drives — small enough for a spec to fake. */
export interface ChartHandle {
  data: DashboardChartConfig['data'];
  options: DashboardChartConfig['options'];
  readonly config: { readonly type: string };
  update(): void;
  destroy(): void;
}

export type ChartFactory = (canvas: HTMLCanvasElement, config: DashboardChartConfig) => ChartHandle;

/**
 * Creates charts with only the Chart.js pieces the dashboards use registered, so the rest of
 * the library tree-shakes away. Reached through DI so specs substitute a fake — jsdom has no
 * canvas, and Angular's vitest builder runs specs non-isolated, so a module mock is unreliable.
 */
export const CHART_FACTORY = new InjectionToken<ChartFactory>('CHART_FACTORY', {
  providedIn: 'root',
  factory: () => {
    Chart.register(
      LineController,
      BarController,
      DoughnutController,
      LineElement,
      BarElement,
      ArcElement,
      PointElement,
      CategoryScale,
      LinearScale,
      Tooltip,
      Filler,
    );
    // The union of three typed configs is wider than Chart's own generic signature accepts.
    return (canvas, config) => new Chart(canvas, config as ChartConfiguration) as ChartHandle;
  },
});
