export type ChartKind = 'line' | 'bar' | 'doughnut';

/** The categorical data-viz slots in styles.scss, assigned in this fixed order — never cycled. */
export const SERIES_TOKENS = ['--series-1', '--series-2', '--series-3'] as const;

/**
 * One coloured series. For a line or bar chart, `values` holds one number per label. For a
 * doughnut, each series is one arc and `values[0]` is its size — so the legend, the colours and
 * the table read the same way for every kind.
 */
export interface ChartSeries {
  key: string;
  label: string;
  values: readonly number[];
  /** A CSS custom property name, e.g. `--series-1`; resolved at render time per theme. */
  colorToken: string;
}

export type ChartCardState = 'loading' | 'ready' | 'empty' | 'error';

/** A swatch + label pair, so a series is never identified by colour alone. */
export interface LegendItem {
  label: string;
  colorToken: string;
}

export interface ChartTableColumn {
  key: string;
  label: string;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
}

/** One table row, keyed by column key, already formatted for display. */
export type ChartTableRow = Readonly<Record<string, string>>;

export interface ChartTable {
  columns: readonly ChartTableColumn[];
  rows: readonly ChartTableRow[];
}
