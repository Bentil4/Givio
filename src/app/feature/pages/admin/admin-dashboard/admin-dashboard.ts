import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import type { AuditLogEntry } from '../../../../data/models/audit-log';
import type { Tenant } from '../../../../data/models/tenant';
import { AuthService } from '../../../../data/services/auth.service';
import { DEFAULT_PERIOD_OPTIONS, PeriodFilter } from '../../../../shared/components/dashboard';
import {
  DASHBOARD_PERIODS,
  bucketsFor,
  comparisonLabelFor,
  periodRange,
  previousRange,
  readStoredPeriod,
  storePeriod,
  type DashboardPeriod,
} from '../../../../utils/dashboard-period.util';
import { AdminDashboardData } from './admin-dashboard-data';
import { loadStateOf, loadedValueOr } from './load-state';
import { ApprovalQueuePanel } from './approval-queue-panel';
import { BreakdownChart } from './breakdown-chart';
import { PlatformActivityPanel } from './platform-activity-panel';
import { PlatformKpis } from './platform-kpis';
import type { PeriodWindow } from './platform-kpis.util';
import {
  companyStatusCounts,
  companyTypeCounts,
  signupsAndApprovalsPerBucket,
  userRoleCounts,
} from './platform-metrics';
import { SignupsApprovalsChart } from './signups-approvals-chart';

const DEFAULT_PERIOD: DashboardPeriod = '30d';
const NO_TENANTS: readonly Tenant[] = [];
const NO_ENTRIES: readonly AuditLogEntry[] = [];

/**
 * Admin overview — platform governance only (AD-12, amended 2026-10-07): companies, signups,
 * approval speed, approval queues, people, support and platform activity. Platform Admins have
 * no access to company Events or Donations, so nothing here reads, totals or lists them.
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [
    PeriodFilter,
    PlatformKpis,
    SignupsApprovalsChart,
    BreakdownChart,
    ApprovalQueuePanel,
    PlatformActivityPanel,
  ],
  providers: [AdminDashboardData],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboard {
  protected readonly data = inject(AdminDashboardData);
  private readonly auth = inject(AuthService);
  private readonly now = new Date();

  protected readonly periodOptions = DEFAULT_PERIOD_OPTIONS;
  private readonly periodKey = computed(
    () => `givio.admin-dashboard.period.${this.auth.currentUser()?.$id ?? 'signed-out'}`,
  );
  public readonly period = linkedSignal(
    () => readStoredPeriod(this.periodKey(), DASHBOARD_PERIODS) ?? DEFAULT_PERIOD,
  );

  protected readonly tenantsState = computed(() => loadStateOf(this.data.tenants));
  protected readonly usersState = computed(() => loadStateOf(this.data.users));
  protected readonly supportState = computed(() => loadStateOf(this.data.openSupportRequests));
  protected readonly activityState = computed(() => loadStateOf(this.data.recentActivity));
  protected readonly tenants = computed(() => loadedValueOr(this.data.tenants, NO_TENANTS));
  protected readonly activity = computed(() => loadedValueOr(this.data.recentActivity, NO_ENTRIES));
  protected readonly openSupportRequests = computed(() =>
    loadedValueOr(this.data.openSupportRequests, null),
  );

  protected readonly window = computed<PeriodWindow>(() => {
    const current = periodRange(this.period(), this.now, earliestSignup(this.tenants()));
    const comparisonLabel = comparisonLabelFor(this.period());
    return { current, previous: previousRange(current), comparisonLabel };
  });
  private readonly buckets = computed(() => bucketsFor(this.window().current, this.period()));
  protected readonly bucketLabels = computed(() => this.buckets().map((b) => b.label));
  protected readonly signupsAndApprovals = computed(() =>
    signupsAndApprovalsPerBucket(this.tenants(), this.buckets()),
  );

  protected readonly statusCounts = computed(() => companyStatusCounts(this.tenants()));
  protected readonly typeCounts = computed(() => companyTypeCounts(this.tenants()));
  protected readonly users = computed(() => loadedValueOr(this.data.users, []));
  protected readonly roleCounts = computed(() => userRoleCounts(this.users()));
  protected readonly usersById = computed(
    () => new Map(this.users().map((user) => [user.id, user])),
  );

  public choosePeriod(period: DashboardPeriod): void {
    this.period.set(period);
    storePeriod(this.periodKey(), period);
  }
}

function earliestSignup(tenants: readonly Tenant[]): string | undefined {
  return tenants.map((tenant) => tenant.createdAt).sort()[0];
}
