/** The theme's chart colours, read from the CSS custom properties in styles.scss. */
export interface ChartPalette {
  /** Resolved colour per series token, e.g. `{ '--series-1': '#2a78d6' }`. */
  series: Readonly<Record<string, string>>;
  grid: string;
  axis: string;
  surface: string;
  text: string;
  font: string;
}

/**
 * Reads the palette at render time, so a theme switch re-colours a chart without the chart
 * knowing either theme's values — they live only in styles.scss.
 */
export function resolveChartPalette(host: Element, seriesTokens: readonly string[]): ChartPalette {
  const style = getComputedStyle(host);
  const read = (token: string) => style.getPropertyValue(token).trim();
  return {
    series: Object.fromEntries(seriesTokens.map((token) => [token, read(token)])),
    grid: read('--chart-grid'),
    axis: read('--chart-axis'),
    surface: read('--chart-surface'),
    text: read('--text-primary'),
    font: read('--font-body'),
  };
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
