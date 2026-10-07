import type { ChartSeries, ChartTable, LegendItem } from './chart.models';

type ValueFormat = (value: number) => string;

/** The row-header column of every chart table; series keys must not reuse it. */
export const CATEGORY_COLUMN = 'category';

/** One swatch + label per series (or per doughnut arc), in series order. */
export function legendFor(series: readonly ChartSeries[]): LegendItem[] {
  return series.map(({ label, colorToken }) => ({ label, colorToken }));
}

/** A doughnut's legend with each arc's value and share beside its name — its direct labels. */
export function sliceLegend(
  series: readonly ChartSeries[],
  valueFormat: ValueFormat,
): LegendItem[] {
  const shares = sharesOf(series);
  return series.map((slice, i) => ({
    label: slice.label,
    colorToken: slice.colorToken,
    detail: `${valueFormat(sliceValue(slice))} · ${shares[i]}%`,
  }));
}

/** A line or bar chart as a table: one row per label, one column per series. */
export function seriesTable(options: {
  labels: readonly string[];
  series: readonly ChartSeries[];
  valueFormat: ValueFormat;
  labelHeading: string;
}): ChartTable {
  const { labels, series, valueFormat, labelHeading } = options;
  return {
    columns: [
      { key: CATEGORY_COLUMN, label: labelHeading },
      ...series.map((s) => ({ key: s.key, label: s.label, numeric: true })),
    ],
    rows: labels.map((label, i) => ({
      [CATEGORY_COLUMN]: label,
      ...Object.fromEntries(series.map((s) => [s.key, valueFormat(s.values[i] ?? 0)])),
    })),
  };
}

/** A doughnut as a table: one row per arc, with its value and share. */
export function sliceTable(options: {
  series: readonly ChartSeries[];
  valueFormat: ValueFormat;
  labelHeading: string;
  valueHeading: string;
}): ChartTable {
  const { series, valueFormat, labelHeading, valueHeading } = options;
  const shares = sharesOf(series);
  return {
    columns: [
      { key: CATEGORY_COLUMN, label: labelHeading },
      { key: 'value', label: valueHeading, numeric: true },
      { key: 'share', label: 'Share', numeric: true },
    ],
    rows: series.map((slice, i) => ({
      [CATEGORY_COLUMN]: slice.label,
      value: valueFormat(sliceValue(slice)),
      share: `${shares[i]}%`,
    })),
  };
}

/** A doughnut's aria-label, e.g. `By donation type: Cash GH₵ 500.00 (71%), …`. */
export function describeSlices(
  title: string,
  series: readonly ChartSeries[],
  valueFormat: ValueFormat,
): string {
  const shares = sharesOf(series);
  const parts = series.map((s, i) => `${s.label} ${valueFormat(sliceValue(s))} (${shares[i]}%)`);
  return `${title}: ${parts.join(', ')}.`;
}

/** A single-series trend's aria-label: its span, total and highest point. */
export function describeTrend(options: {
  title: string;
  labels: readonly string[];
  values: readonly number[];
  valueFormat: ValueFormat;
}): string {
  const { title, labels, values, valueFormat } = options;
  if (values.length === 0) return `${title}: no data.`;
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(...values);
  const span = `${labels[0]} to ${labels[labels.length - 1]}`;
  const highest = `highest ${valueFormat(peak)} at ${labels[values.indexOf(peak)]}`;
  return `${title}, ${span}: total ${valueFormat(total)}, ${highest}.`;
}

function sliceValue(slice: ChartSeries): number {
  return slice.values[0] ?? 0;
}

function sharesOf(series: readonly ChartSeries[]): number[] {
  const total = series.reduce((sum, slice) => sum + sliceValue(slice), 0);
  return series.map((slice) => (total > 0 ? Math.round((sliceValue(slice) / total) * 100) : 0));
}
