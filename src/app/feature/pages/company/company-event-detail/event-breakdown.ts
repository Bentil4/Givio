import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Donation } from '../../../../data/models/donation';
import { countedDonations } from '../../../../utils/donation.util';
import { donationStats, donationTypeSlices } from '../../../../utils/donation-breakdown.util';

/**
 * One Event's headline figures and its split by donation type, from the same counting rule as
 * every other total — removed, in-conflict and rejected records are left out.
 */
@Component({
  selector: 'app-event-breakdown',
  template: `
    <ul class="stat-grid" aria-label="Event figures">
      @for (s of stats(); track s.key) {
        <li class="stat-card glass">
          <span class="stat-label">{{ s.key }}</span>
          <span class="stat-value">{{ s.value }}</span>
          <span class="t-tertiary">{{ s.sub }}</span>
        </li>
      }
    </ul>

    <section class="type-card glass" aria-labelledby="type-breakdown-title">
      <h2 id="type-breakdown-title" class="t-card-title">By donation type</h2>
      <ul class="type-list">
        @for (slice of slices(); track slice.type) {
          <li class="type-row">
            <span class="t-body-em">{{ slice.label }}</span>
            <span class="type-value">{{ slice.valueLabel }}</span>
            <span class="type-pct">{{ slice.percent }}%</span>
            <span class="type-track" aria-hidden="true">
              <span class="type-bar" [style.width.%]="slice.percent"></span>
            </span>
          </li>
        }
      </ul>
    </section>
  `,
  styleUrl: './event-breakdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventBreakdown {
  public readonly donations = input.required<readonly Donation[]>();
  public readonly dateLabel = input('');

  private readonly counted = computed(() => countedDonations(this.donations()));
  public readonly stats = computed(() => donationStats(this.counted(), this.dateLabel()));
  public readonly slices = computed(() => donationTypeSlices(this.counted()));
}
