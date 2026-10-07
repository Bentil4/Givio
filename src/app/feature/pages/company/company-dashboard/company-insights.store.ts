import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { ServiceError } from '../../../../core/services/service-error';
import { AuthService } from '../../../../data/services/auth.service';
import {
  SettlementDataService,
  type TenantSettlementData,
} from '../../../../data/services/settlement-data.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import {
  DASHBOARD_PERIODS,
  readStoredPeriod,
  storePeriod,
  type DashboardPeriod,
} from '../../../../utils/dashboard-period.util';
import { companyInsights, companyKpis, type InsightsStatus } from './company-insights.util';

const DEFAULT_PERIOD: DashboardPeriod = '30d';

// A busy desk pushes a donation every few seconds; one re-read per lull is plenty.
const REFRESH_DELAY_MS = 2_000;

/**
 * The company dashboard's period-filtered insights, scoped to the dashboard that provides it.
 * Everything comes from one read of the tenant's events and donations; changing the period
 * only re-slices that read. The live headline stays with CompanyTotalsStore.
 */
@Injectable()
export class CompanyInsightsStore {
  private readonly settlementData = inject(SettlementDataService);
  private readonly teamData = inject(TeamDataService);
  private readonly tenantService = inject(TenantService);
  private readonly periodKey = periodStorageKey(inject(AuthService).currentUser()?.$id);
  private readonly data = signal<TenantSettlementData | null>(null);
  private readonly readAt = signal(new Date());
  private readonly names = signal<ReadonlyMap<string, string>>(new Map());
  private latestRequest = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  public readonly period = signal(
    readStoredPeriod(this.periodKey, DASHBOARD_PERIODS) ?? DEFAULT_PERIOD,
  );
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly recorderNamesMissing = signal(false);
  /** Recorder names by user id, revoked members included (FR-13). */
  public readonly recorderNames = this.names.asReadonly();

  public readonly insights = computed(() => {
    const data = this.data();
    return data && companyInsights(data, this.period(), this.readAt());
  });

  public readonly kpis = computed(() => {
    const insights = this.insights();
    return insights && companyKpis(insights);
  });

  public readonly status = computed<InsightsStatus>(() => {
    if (this.loading()) return 'loading';
    return this.loadError() === null && this.data() !== null ? 'ready' : 'error';
  });

  public readonly isFirstRun = computed(() => this.data()?.events.length === 0);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.refreshTimer));
  }

  choosePeriod(period: DashboardPeriod): void {
    this.period.set(period);
    storePeriod(this.periodKey, period);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    await Promise.all([this.loadInsightsData(), this.loadRecorderNames()]);
    this.loading.set(false);
  }

  /** Re-reads after a lull in donation pushes, without blanking what is on screen. */
  refreshSoon(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refreshQuietly(), REFRESH_DELAY_MS);
  }

  private async loadInsightsData(): Promise<void> {
    try {
      await this.readLatestData();
    } catch (error) {
      this.loadError.set(
        error instanceof ServiceError ? error.message : "We couldn't load your insights",
      );
    }
  }

  // A failed background re-read keeps the last complete read on screen; the next push retries.
  private refreshQuietly(): void {
    this.readLatestData().catch(() => undefined);
  }

  /** Overlapping reads can finish out of order; only the newest may replace the data. */
  private async readLatestData(): Promise<void> {
    const request = ++this.latestRequest;
    const data = await this.settlementData.loadTenantSettlementData(this.currentTenantId());
    if (request !== this.latestRequest) return;
    this.data.set(data);
    this.readAt.set(new Date());
    this.loadError.set(null);
  }

  private async loadRecorderNames(): Promise<void> {
    try {
      const members = await this.teamData.listTeamMembersIncludingRevoked();
      this.names.set(new Map(members.map((member) => [member.userId, member.name])));
      this.recorderNamesMissing.set(false);
    } catch {
      this.recorderNamesMissing.set(true);
    }
  }

  private currentTenantId(): string {
    const tenantId = this.tenantService.context()?.membership.tenantId;
    if (!tenantId) {
      throw new ServiceError("We couldn't find your company");
    }
    return tenantId;
  }
}

function periodStorageKey(userId: string | undefined): string {
  return `givio:dashboard-period:company:${userId ?? 'signed-out'}`;
}
