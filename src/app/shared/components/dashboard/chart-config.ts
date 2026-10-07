import type { ChartConfiguration, ChartDataset, ChartType, Plugin, TooltipItem } from 'chart.js';
import type { ChartPalette } from './chart-palette';
import type { DashboardChartConfig } from './chart-registry';
import type { ChartKind, ChartSeries } from './chart.models';

/** Everything a chart's look depends on besides the theme. */
export interface ChartSpec {
  kind: ChartKind;
  labels: readonly string[];
  series: readonly ChartSeries[];
  valueFormat: (value: number) => string;
  axisFormat: (value: number) => string;
  horizontal: boolean;
  compact: boolean;
  animate: boolean;
}

interface CrosshairOptions {
  color?: string;
}

declare module 'chart.js' {
  // Chart.js declares this interface with a type parameter, and a merge must match it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    crosshair: CrosshairOptions;
  }
}

const LINE_WIDTH = 2;
const POINT_HIT_RADIUS = 8;
const BAR_END_RADIUS = 4;
const MAX_BAR_THICKNESS = 32;
// Above this many points a line reads as a trend; dots on every point would only add noise.
const MAX_DOTTED_POINTS = 12;
const AXIS_FONT_SIZE = 12;

/**
 * The Chart.js configuration for a spec, following the dataviz rules: one value axis, 2px
 * lines, 4px rounded bar ends on the baseline, a recessive grid, a crosshair on lines and a
 * per-mark tooltip on bars and arcs. Text wears text tokens; only marks wear series colours.
 */
export function buildChartConfig(spec: ChartSpec, palette: ChartPalette): DashboardChartConfig {
  if (spec.kind === 'doughnut') return doughnutConfig(spec, palette);
  return spec.kind === 'line' ? lineConfig(spec, palette) : barConfig(spec, palette);
}

function lineConfig(spec: ChartSpec, palette: ChartPalette): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: [...spec.labels],
      datasets: spec.series.map((series) => lineDataset(series, spec, palette)),
    },
    options: {
      ...commonOptions(spec),
      interaction: { mode: 'index', intersect: false },
      scales: cartesianScales(spec, palette),
      plugins: {
        ...commonPlugins<'line'>(spec, palette, seriesTooltipLabel(spec)),
        crosshair: { color: spec.compact ? undefined : palette.axis },
      },
    },
    plugins: [crosshairPlugin],
  };
}

function barConfig(spec: ChartSpec, palette: ChartPalette): ChartConfiguration<'bar'> {
  return {
    type: 'bar',
    data: {
      labels: [...spec.labels],
      datasets: spec.series.map((series) => barDataset(series, palette)),
    },
    options: {
      ...commonOptions(spec),
      indexAxis: spec.horizontal ? 'y' : 'x',
      interaction: { mode: 'nearest', axis: spec.horizontal ? 'y' : 'x', intersect: false },
      scales: cartesianScales(spec, palette),
      plugins: commonPlugins<'bar'>(spec, palette, seriesTooltipLabel(spec)),
    },
  };
}

function doughnutConfig(spec: ChartSpec, palette: ChartPalette): ChartConfiguration<'doughnut'> {
  return {
    type: 'doughnut',
    data: {
      labels: spec.series.map((series) => series.label),
      datasets: [
        {
          data: spec.series.map((series) => series.values[0] ?? 0),
          backgroundColor: spec.series.map((series) => palette.series[series.colorToken]),
          borderColor: palette.surface,
          borderWidth: 2,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      ...commonOptions(spec),
      cutout: '62%',
      plugins: commonPlugins<'doughnut'>(spec, palette, (item) => {
        return `${item.label}: ${spec.valueFormat(Number(item.raw))}`;
      }),
    },
  };
}

function lineDataset(
  series: ChartSeries,
  spec: ChartSpec,
  palette: ChartPalette,
): ChartDataset<'line'> {
  const color = palette.series[series.colorToken];
  const dotted = !spec.compact && series.values.length <= MAX_DOTTED_POINTS;
  return {
    label: series.label,
    data: [...series.values],
    borderColor: color,
    backgroundColor: color,
    pointBackgroundColor: color,
    pointBorderColor: palette.surface,
    borderWidth: LINE_WIDTH,
    pointRadius: dotted ? 3 : 0,
    pointHoverRadius: spec.compact ? 0 : 5,
    pointHitRadius: POINT_HIT_RADIUS,
    tension: 0,
  };
}

function barDataset(series: ChartSeries, palette: ChartPalette): ChartDataset<'bar'> {
  return {
    label: series.label,
    data: [...series.values],
    backgroundColor: palette.series[series.colorToken],
    borderRadius: BAR_END_RADIUS,
    borderSkipped: 'start',
    maxBarThickness: MAX_BAR_THICKNESS,
  };
}

// A sparkline is a glanceable shape only — no hover, so it never traps a pointer or a reader.
function commonOptions(spec: ChartSpec) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: spec.animate ? { duration: 300 } : (false as const),
    ...(spec.compact ? { events: [] } : {}),
  };
}

function commonPlugins<T extends ChartType>(
  spec: ChartSpec,
  palette: ChartPalette,
  label: (item: TooltipItem<T>) => string,
) {
  return {
    legend: { display: false },
    tooltip: {
      enabled: !spec.compact,
      backgroundColor: palette.surface,
      titleColor: palette.text,
      bodyColor: palette.text,
      borderColor: palette.grid,
      borderWidth: 1,
      padding: 8,
      boxPadding: 4,
      titleFont: { family: palette.font },
      bodyFont: { family: palette.font },
      callbacks: { label },
    },
  };
}

function seriesTooltipLabel(spec: ChartSpec) {
  return (item: TooltipItem<'line' | 'bar'>) =>
    `${item.dataset.label}: ${spec.valueFormat(Number(item.raw))}`;
}

function cartesianScales(spec: ChartSpec, palette: ChartPalette) {
  if (spec.compact) return { x: { display: false }, y: { display: false, beginAtZero: true } };
  const category = categoryScale(palette);
  const value = valueScale(spec, palette);
  return spec.horizontal ? { x: value, y: category } : { x: category, y: value };
}

function categoryScale(palette: ChartPalette) {
  return {
    grid: { display: false },
    border: { color: palette.grid },
    ticks: { color: palette.axis, font: { family: palette.font, size: AXIS_FONT_SIZE } },
  };
}

function valueScale(spec: ChartSpec, palette: ChartPalette) {
  return {
    beginAtZero: true,
    grid: { color: palette.grid },
    border: { display: false },
    ticks: {
      color: palette.axis,
      font: { family: palette.font, size: AXIS_FONT_SIZE },
      maxTicksLimit: 5,
      callback: (value: string | number) => spec.axisFormat(Number(value)),
    },
  };
}

/** A thin vertical rule at the hovered index, so a line's crosshair tooltip has an anchor. */
const crosshairPlugin: Plugin<'line', CrosshairOptions> = {
  id: 'crosshair',
  afterDatasetsDraw: (chart, _args, options) => {
    const [active] = chart.tooltip?.getActiveElements() ?? [];
    if (!active || !options.color) return;
    drawVerticalRule(chart.ctx, active.element.x, {
      top: chart.chartArea.top,
      bottom: chart.chartArea.bottom,
      color: options.color,
    });
  },
};

function drawVerticalRule(
  ctx: CanvasRenderingContext2D,
  x: number,
  rule: { top: number; bottom: number; color: string },
): void {
  ctx.save();
  ctx.strokeStyle = rule.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, rule.top);
  ctx.lineTo(x, rule.bottom);
  ctx.stroke();
  ctx.restore();
}
