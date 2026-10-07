import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TenantService } from '../../../../data/services/tenant.service';
import { DEFAULT_PERIOD_OPTIONS, PeriodFilter } from '../../../../shared/components/dashboard';
import { CompanyInsightsStore } from './company-insights.store';
import { CompanyKpiRow } from './company-kpis';
import { CompanyRankingCharts } from './company-ranking-charts';
import { CompanyTotalsStore } from './company-totals.store';
import { CompanyTrendCharts } from './company-trend-charts';
import { ConsolidatedTotal } from './consolidated-total';
import { DonationFeed } from './donation-feed';
import { EventTotalsList } from './event-totals-list';
import { UpcomingEvents } from './upcoming-events';

/**
 * The Organizer tier's landing page (Super Organizer and co-Organizer alike, read-only): the
 * live consolidated total (Story 8.4, FR-21), then the chosen period's figures, charts and
 * activity, all from one read of the company's events and donations.
 */
@Component({
  selector: 'app-company-dashboard',
  imports: [
    MatIconModule,
    RouterLink,
    PeriodFilter,
    ConsolidatedTotal,
    EventTotalsList,
    CompanyKpiRow,
    CompanyTrendCharts,
    CompanyRankingCharts,
    DonationFeed,
    UpcomingEvents,
  ],
  providers: [CompanyTotalsStore, CompanyInsightsStore],
  templateUrl: './company-dashboard.html',
  styleUrl: './company-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyDashboard implements OnInit {
  private readonly tenant = inject(TenantService).tenant;

  protected readonly totals = inject(CompanyTotalsStore);
  protected readonly insights = inject(CompanyInsightsStore);
  protected readonly periodOptions = DEFAULT_PERIOD_OPTIONS;
  public readonly companyName = computed(() => this.tenant()?.name ?? 'Your company');

  constructor() {
    effect(() => {
      if (this.totals.donationChangeCount() > 0) {
        untracked(() => this.insights.refreshSoon());
      }
    });
  }

  ngOnInit(): void {
    void this.totals.start();
    void this.insights.load();
  }
}
