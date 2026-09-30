import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TenantService } from '../../../../data/services/tenant.service';

/**
 * The approved Organizer's landing page. Intentionally empty for now — the consolidated total
 * (Story 8.4), team (7.1) and reports (8.5) fill it in.
 */
@Component({
  selector: 'app-company-dashboard',
  imports: [MatIconModule],
  template: `
    <section class="page" aria-labelledby="company-dashboard-title">
      <header class="page-head">
        <h1 id="company-dashboard-title" class="t-page-title">{{ companyName() }}</h1>
        <p class="t-secondary">Your company is approved and ready to go.</p>
      </header>
      <article class="empty glass">
        <mat-icon class="empty-icon" aria-hidden="true">domain</mat-icon>
        <h2 class="t-card-title">Nothing here yet</h2>
        <p class="t-caption">Your events, team and totals will appear here as they're set up.</p>
      </article>
    </section>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-2xl) var(--space-lg);
      border-radius: var(--radius-lg);
      text-align: center;

      h2,
      p {
        margin: 0;
      }
    }

    .empty-icon {
      width: 40px;
      height: 40px;
      font-size: 40px;
      color: var(--text-tertiary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyDashboard {
  private readonly tenant = inject(TenantService).tenant;

  public readonly companyName = computed(() => this.tenant()?.name ?? 'Your company');
}
