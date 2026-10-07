import type { ChartConfiguration, TooltipItem } from 'chart.js';
import { buildChartConfig, type ChartSpec } from './chart-config';
import type { ChartPalette } from './chart-palette';
import type { ChartSeries } from './chart.models';

describe('buildChartConfig', () => {
  const palette: ChartPalette = {
    series: { '--series-1': '#2a78d6', '--series-2': '#eb6834' },
    grid: '#d9d5c9',
    axis: '#55524a',
    surface: '#ffffff',
    text: '#1d1b16',
    font: 'Inter',
  };
  const cash: ChartSeries = {
    key: 'cash',
    label: 'Cash',
    values: [100, 200],
    colorToken: '--series-1',
  };
  const momo: ChartSeries = {
    key: 'momo',
    label: 'Mobile Money',
    values: [50, 0],
    colorToken: '--series-2',
  };

  function spec(overrides: Partial<ChartSpec> = {}): ChartSpec {
    return {
      kind: 'line',
      labels: ['Mon', 'Tue'],
      series: [cash, momo],
      valueFormat: (value) => `GH₵ ${value / 100}`,
      axisFormat: (value) => `${value / 100}`,
      horizontal: false,
      compact: false,
      animate: true,
      ...overrides,
    };
  }

  it('draws lines 2px wide in their series colour with a hit radius of at least 8px', () => {
    const config = buildChartConfig(spec(), palette) as ChartConfiguration<'line'>;
    const [first, second] = config.data.datasets;

    expect(first.borderColor).toBe('#2a78d6');
    expect(second.borderColor).toBe('#eb6834');
    expect(first.borderWidth).toBe(2);
    expect(first.pointHitRadius).toBeGreaterThanOrEqual(8);
  });

  it('gives lines an index tooltip and a crosshair, with values in the value format', () => {
    const config = buildChartConfig(spec(), palette) as ChartConfiguration<'line'>;
    const label = config.options?.plugins?.tooltip?.callbacks?.label as (
      item: TooltipItem<'line'>,
    ) => string;

    expect(config.options?.interaction).toEqual({ mode: 'index', intersect: false });
    expect(config.plugins?.map((plugin) => plugin.id)).toEqual(['crosshair']);
    expect(label({ dataset: { label: 'Cash' }, raw: 2500 } as TooltipItem<'line'>)).toBe(
      'Cash: GH₵ 25',
    );
  });

  it('rounds bar ends at 4px, anchored to the baseline, and can run horizontally', () => {
    const config = buildChartConfig(
      spec({ kind: 'bar', horizontal: true }),
      palette,
    ) as ChartConfiguration<'bar'>;

    expect(config.data.datasets[0].borderRadius).toBe(4);
    expect(config.data.datasets[0].borderSkipped).toBe('start');
    expect(config.options?.indexAxis).toBe('y');
    expect(config.options?.scales?.['x']?.grid?.color).toBe('#d9d5c9');
    expect(config.options?.scales?.['y']?.grid?.display).toBe(false);
  });

  it('keeps axis text in the axis token, never a series colour', () => {
    const config = buildChartConfig(spec({ kind: 'bar' }), palette) as ChartConfiguration<'bar'>;

    expect(config.options?.scales?.['x']?.ticks?.color).toBe('#55524a');
    expect(config.options?.scales?.['y']?.ticks?.color).toBe('#55524a');
  });

  it('separates doughnut arcs with a 2px surface-coloured border', () => {
    const config = buildChartConfig(
      spec({ kind: 'doughnut' }),
      palette,
    ) as ChartConfiguration<'doughnut'>;
    const [arcs] = config.data.datasets;

    expect(config.data.labels).toEqual(['Cash', 'Mobile Money']);
    expect(arcs.data).toEqual([100, 50]);
    expect(arcs.backgroundColor).toEqual(['#2a78d6', '#eb6834']);
    expect(arcs.borderColor).toBe('#ffffff');
    expect(arcs.borderWidth).toBe(2);
  });

  it('hides axes, tooltips and hover on a compact sparkline', () => {
    const config = buildChartConfig(spec({ compact: true }), palette) as ChartConfiguration<'line'>;

    expect(config.options?.scales?.['x']?.display).toBe(false);
    expect(config.options?.plugins?.tooltip?.enabled).toBe(false);
    expect(config.options?.events).toEqual([]);
    expect(config.data.datasets[0].pointRadius).toBe(0);
  });

  it('turns animation off when reduced motion is preferred', () => {
    expect(buildChartConfig(spec({ animate: false }), palette).options?.animation).toBe(false);
  });
});
