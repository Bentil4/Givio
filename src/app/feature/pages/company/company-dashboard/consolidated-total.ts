import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SkeletonRows } from '../../../../shared/components/skeleton-rows/skeleton-rows';
import { formatCedis } from '../../../../utils/donation.util';
import { countLabel, type ConsolidatedSummary } from './company-totals.util';

/**
 * The headline figure. Zero is a real total, never an empty state (FR-21): a new company sees
 * GH₵ 0.00 the same way a busy one sees its sum. When an Event's figures couldn't load, the
 * total still shows the rest but says plainly that it is partial — and by how many Events —
 * inside the same live region, so a screen reader hears the caveat with the number.
 */
@Component({
  selector: 'app-consolidated-total',
  imports: [SkeletonRows],
  template: `
    <article class="total-card glass" aria-labelledby="consolidated-total-title">
      <h2 id="consolidated-total-title" class="total-title">Company total</h2>
      @if (loading()) {
        <app-skeleton-rows [rows]="1" label="Loading your company total…" />
      } @else {
        <div aria-live="polite" aria-atomic="true">
          <p class="total-value">
            {{ totalLabel() }}
            @if (isPartial()) {
              <span class="tag tag-info">Partial</span>
            }
          </p>
          @if (isPartial()) {
            <p class="partial-note t-caption">
              Doesn't include {{ failedLabel() }} that couldn't load — see below.
            </p>
          }
        </div>
        <p class="total-scope t-caption">{{ scopeLabel() }}</p>
      }
    </article>
  `,
  styles: `
    .total-card {
      padding: var(--space-lg);
      border-radius: var(--radius-md);
    }

    .total-title {
      margin: 0;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--data-4);
    }

    .total-value {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-sm);
      margin: var(--space-xs) 0 0;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--primary-dark);

      .tag {
        font-family: var(--font-body);
        letter-spacing: 0;
      }
    }

    .partial-note,
    .total-scope {
      margin: var(--space-xs) 0 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsolidatedTotal {
  public readonly summary = input.required<ConsolidatedSummary>();
  public readonly loading = input(false);

  protected readonly totalLabel = computed(() => formatCedis(this.summary().totalMinor));
  protected readonly isPartial = computed(() => this.summary().failedCount > 0);
  protected readonly failedLabel = computed(() => countLabel(this.summary().failedCount, 'event'));

  protected readonly scopeLabel = computed(() => {
    const { runningCount, activeCount, donorCount } = this.summary();
    if (runningCount === 0) {
      return 'No running events yet — this grows as your events record donations.';
    }
    const paused = runningCount - activeCount;
    const split = paused > 0 ? ` (${activeCount} active, ${paused} paused)` : '';
    return `Across ${countLabel(runningCount, 'running event')}${split} · ${countLabel(donorCount, 'donor')}`;
  });
}
