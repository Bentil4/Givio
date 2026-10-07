import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { KpiTile } from '../../../../shared/components/dashboard';
import { formatCedis, formatCedisShort } from '../../../../utils/donation.util';
import type { KpiDelta } from '../../../../utils/trend.util';
import type { OperatorDataState, OperatorKpis } from './operator-insights.util';
import { PERIOD_PHRASES, type OperatorPeriod } from './operator-period';

interface DonationTileView {
  key: string;
  label: string;
  value: string;
  delta: KpiDelta | null;
  hint: string;
}

// A visible gap, never a GH₵ 0 that reads as "nothing raised" (EXPERIENCE: couldn't-load state).
const NOT_LOADED = '—';
const NOT_LOADED_HINT = "Couldn't load — try again below";

/** The Operator's headline figures for the chosen period, plus what is still waiting to sync. */
@Component({
  selector: 'app-operator-kpi-row',
  imports: [KpiTile],
  template: `
    <ul class="stat-grid" aria-label="Donation figures">
      @for (tile of donationTiles(); track tile.key) {
        <li>
          <app-kpi-tile
            [label]="tile.label"
            [value]="tile.value"
            [delta]="tile.delta"
            [hint]="tile.hint"
            [loading]="state() === 'loading'"
          />
        </li>
      }
      <li>
        <app-kpi-tile
          label="Waiting to sync"
          [value]="pendingCount().toString()"
          [hint]="pendingHint()"
          [tone]="pendingCount() > 0 ? 'warning' : 'default'"
          [link]="pendingCount() > 0 ? '/organizer/donations' : null"
          linkLabel="See your donations"
        />
      </li>
    </ul>
  `,
  styleUrl: './operator-kpi-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperatorKpiRow {
  public readonly kpis = input.required<OperatorKpis>();
  public readonly period = input.required<OperatorPeriod>();
  public readonly state = input.required<OperatorDataState>();
  /** Which Events the figures cover, e.g. "Every desk at Ama & Kojo". */
  public readonly scopeText = input('');
  public readonly pendingCount = input.required<number>();

  protected readonly donationTiles = computed<DonationTileView[]>(() =>
    this.state() === 'error' ? this.unloadedTiles() : this.loadedTiles(),
  );

  protected readonly pendingHint = computed(() =>
    this.pendingCount() > 0
      ? "Saved on this device — it sends when you're back online"
      : 'Everything has synced',
  );

  private loadedTiles(): DonationTileView[] {
    const kpis = this.kpis();
    const phrase = PERIOD_PHRASES[this.period()];
    return [
      {
        key: 'raised',
        label: `Raised ${phrase}`,
        value: formatCedisShort(kpis.raisedMinor),
        delta: kpis.raisedDelta,
        hint: this.scopeText(),
      },
      {
        key: 'donors',
        label: `Donors ${phrase}`,
        value: kpis.donors.toLocaleString('en-GH'),
        delta: kpis.donorsDelta,
        hint: '',
      },
      {
        key: 'mine',
        label: `My recordings ${phrase}`,
        value: kpis.myCount.toLocaleString('en-GH'),
        delta: null,
        hint: `${formatCedis(kpis.myRaisedMinor)} recorded by you`,
      },
    ];
  }

  private unloadedTiles(): DonationTileView[] {
    return this.loadedTiles().map((view) => ({
      ...view,
      value: NOT_LOADED,
      delta: null,
      hint: NOT_LOADED_HINT,
    }));
  }
}
