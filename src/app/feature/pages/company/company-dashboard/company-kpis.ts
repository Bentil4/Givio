import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { KpiTile } from '../../../../shared/components/dashboard';
import type { CompanyKpis, InsightsStatus, KpiFigure } from './company-insights.util';

interface KpiTileView {
  label: string;
  figure: KpiFigure;
  sparkline: readonly number[];
  link: string | null;
}

// Shown in place of every figure when the read failed, so no tile can pass for a real zero.
const UNAVAILABLE: KpiFigure = { value: '—', delta: null, hint: "Couldn't load" };

/** The headline row: raised, donors, average gift and running events for the chosen period. */
@Component({
  selector: 'app-company-kpis',
  imports: [KpiTile],
  template: `
    <ul class="stat-grid" aria-label="Key figures for this period">
      @for (tile of tiles(); track tile.label) {
        <li>
          <app-kpi-tile
            [label]="tile.label"
            [value]="tile.figure.value"
            [delta]="tile.figure.delta"
            [hint]="tile.figure.hint"
            [sparkline]="tile.sparkline"
            [link]="tile.link"
            linkLabel="Manage events"
            [loading]="status() === 'loading'"
          />
        </li>
      }
    </ul>
  `,
  styleUrl: './company-dashboard-sections.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyKpiRow {
  public readonly kpis = input.required<CompanyKpis | null>();
  public readonly status = input.required<InsightsStatus>();

  protected readonly tiles = computed<KpiTileView[]>(() => {
    const kpis = this.kpis();
    return [
      tile('Raised in period', kpis?.raised, kpis?.raised.sparkline),
      tile('Donors', kpis?.donors),
      tile('Average gift', kpis?.averageGift),
      { ...tile('Running events', kpis?.runningEvents), link: '/company/events' },
    ];
  });
}

function tile(label: string, figure?: KpiFigure, sparkline: readonly number[] = []): KpiTileView {
  return { label, figure: figure ?? UNAVAILABLE, sparkline, link: null };
}
