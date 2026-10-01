import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TenantService } from '../../../../data/services/tenant.service';
import { CompanyTotalsStore } from './company-totals.store';
import { ConsolidatedTotal } from './consolidated-total';
import { EventTotalsList } from './event-totals-list';

/**
 * The approved Organizer's landing page: a live consolidated total across the company's
 * running Events with a per-Event breakdown underneath (Story 8.4, FR-21).
 */
@Component({
  selector: 'app-company-dashboard',
  imports: [MatIconModule, ConsolidatedTotal, EventTotalsList],
  providers: [CompanyTotalsStore],
  template: `
    <section class="page" aria-labelledby="company-dashboard-title">
      <header class="page-head">
        <h1 id="company-dashboard-title" class="t-page-title">{{ companyName() }}</h1>
        <p class="t-secondary">Live totals across your running events.</p>
      </header>
      @if (store.loadError(); as error) {
        <div class="load-error" role="alert">
          <mat-icon aria-hidden="true">error_outline</mat-icon>
          <p class="t-caption">{{ error }}</p>
          <button type="button" class="btn-ghost" (click)="store.start()">Try again</button>
        </div>
      } @else {
        <app-consolidated-total [summary]="store.summary()" [loading]="store.loading()" />
        <app-event-totals-list
          [rows]="store.rows()"
          [loading]="store.loading()"
          (retry)="store.retryEvent($event)"
        />
      }
    </section>
  `,
  styles: `
    .page {
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    }

    .page-head > * {
      margin: 0 0 4px;
    }

    .load-error {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-md);
      border: 1.5px solid var(--func-error);
      border-radius: var(--radius-md);
      background: var(--func-error-soft);

      mat-icon {
        color: var(--func-error);
      }

      p {
        flex: 1;
        margin: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyDashboard implements OnInit {
  private readonly tenant = inject(TenantService).tenant;

  protected readonly store = inject(CompanyTotalsStore);
  public readonly companyName = computed(() => this.tenant()?.name ?? 'Your company');

  ngOnInit(): void {
    void this.store.start();
  }
}
