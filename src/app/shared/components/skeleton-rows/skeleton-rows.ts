import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Pulsing placeholder rows — the admin-dashboard's loading treatment (Story 4.1), extracted so
 * other dashboards load the same way. Announces itself once as a status message; the bars
 * themselves are decorative.
 */
@Component({
  selector: 'app-skeleton-rows',
  template: `
    <div role="status" class="skeleton">
      <span class="visually-hidden">{{ label() }}</span>
      @for (row of rowIndexes(); track row) {
        <div class="skel-row" aria-hidden="true"><span class="skel"></span></div>
      }
    </div>
  `,
  styles: `
    .skel-row {
      padding: var(--space-md) var(--space-lg);
      border-bottom: 1px solid rgba(15, 122, 140, 0.07);

      &:last-child {
        border-bottom: 0;
      }
    }

    .skel {
      display: block;
      width: 100%;
      height: 12px;
      border-radius: var(--radius-sm);
      background: var(--data-1);
      animation: skeleton-pulse 1.4s var(--ease) infinite;
    }

    @keyframes skeleton-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.45;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .skel {
        animation: none;
      }
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonRows {
  public readonly rows = input(3);
  public readonly label = input('Loading…');

  protected readonly rowIndexes = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
}
