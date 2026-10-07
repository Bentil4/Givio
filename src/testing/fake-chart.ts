import type { Provider } from '@angular/core';
import {
  CHART_FACTORY,
  type ChartFactory,
  type ChartHandle,
  type DashboardChartConfig,
} from '../app/shared/components/dashboard/chart-registry';

/** A Chart.js stand-in that records what app-chart asked of it — jsdom has no canvas. */
export interface FakeChart extends ChartHandle {
  readonly canvas: HTMLCanvasElement;
  readonly createdWith: DashboardChartConfig;
  updates: number;
  destroyed: boolean;
}

export interface FakeCharts {
  readonly created: FakeChart[];
  readonly provider: Provider;
}

/** Provide `provider` in a spec's TestBed; every chart app-chart creates lands in `created`. */
export function createFakeCharts(): FakeCharts {
  const created: FakeChart[] = [];
  const factory: ChartFactory = (canvas, config) => {
    const chart = fakeChart(canvas, config);
    created.push(chart);
    return chart;
  };
  return { created, provider: { provide: CHART_FACTORY, useValue: factory } };
}

function fakeChart(canvas: HTMLCanvasElement, config: DashboardChartConfig): FakeChart {
  return {
    canvas,
    createdWith: config,
    config: { type: config.type },
    data: config.data,
    options: config.options,
    updates: 0,
    destroyed: false,
    update() {
      this.updates++;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}
