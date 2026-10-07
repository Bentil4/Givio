import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { LegendItem } from './chart.models';

/** Swatch + label per series, in HTML so the names are real, readable, zoomable text. */
@Component({
  selector: 'app-chart-legend',
  template: `
    <ul class="chart-legend">
      @for (item of items(); track item.label) {
        <li class="legend-item">
          <span class="legend-swatch" aria-hidden="true" [style.background]="swatchOf(item)"></span>
          <span class="legend-label">{{ item.label }}</span>
          @if (item.detail) {
            <span class="legend-detail">{{ item.detail }}</span>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs) var(--space-md);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .legend-swatch {
      flex: none;
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }

    .legend-label {
      font-weight: 600;
      color: var(--text-primary);
    }

    .legend-detail {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartLegend {
  public readonly items = input.required<readonly LegendItem[]>();

  protected swatchOf(item: LegendItem): string {
    return `var(${item.colorToken})`;
  }
}
