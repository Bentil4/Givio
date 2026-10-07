import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { Tenant } from '../../../../data/models/tenant';
import type {
  ApprovalCountsState,
  PendingApprovalCounts,
} from '../../../../data/models/approval-counts';
import { KpiTile } from '../../../../shared/components/dashboard';
import type { LoadState } from './load-state';
import {
  TURNAROUND_STATUS_TEXT,
  UNAVAILABLE_KPI,
  activeCompaniesKpi,
  approvalTurnaroundKpi,
  newSignupsKpi,
  openSupportKpi,
  pendingApprovalsKpi,
  type KpiView,
  type PeriodWindow,
  type TurnaroundView,
} from './platform-kpis.util';

const STATUS_ICONS = { 'on-target': 'check_circle', 'over-target': 'schedule' } as const;

/** The overview's headline row: companies, signups, approval speed, approvals and support. */
@Component({
  selector: 'app-platform-kpis',
  imports: [MatIconModule, KpiTile],
  templateUrl: './platform-kpis.html',
  styleUrl: './platform-kpis.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformKpis {
  /** Empty unless `tenantsState` is ready. */
  public readonly tenants = input.required<readonly Tenant[]>();
  public readonly tenantsState = input.required<LoadState>();
  public readonly window = input.required<PeriodWindow>();
  /** New companies per chart bucket, oldest first — the signups sparkline. */
  public readonly signupTrend = input<readonly number[]>([]);
  public readonly pendingApprovals = input.required<PendingApprovalCounts>();
  public readonly pendingApprovalsState = input.required<ApprovalCountsState>();
  /** null when the count couldn't be read. */
  public readonly openSupportRequests = input.required<number | null>();
  public readonly supportState = input.required<LoadState>();

  protected readonly tenantsLoading = computed(() => this.tenantsState() === 'loading');
  protected readonly activeCompanies = computed(() => this.fromTenants(activeCompaniesKpi));
  protected readonly newSignups = computed(() => this.fromTenants(newSignupsKpi));
  protected readonly turnaround = computed<TurnaroundView>(() => {
    const view = this.fromTenants(approvalTurnaroundKpi);
    return { status: null, ...view };
  });
  protected readonly pending = computed(() =>
    pendingApprovalsKpi(this.pendingApprovals(), this.pendingApprovalsState()),
  );
  protected readonly support = computed(() => openSupportKpi(this.openSupportRequests()));
  protected readonly statusText = TURNAROUND_STATUS_TEXT;
  protected readonly statusIcons = STATUS_ICONS;

  private fromTenants<T extends KpiView>(
    view: (tenants: readonly Tenant[], window: PeriodWindow) => T,
  ): T | KpiView {
    return this.tenantsState() === 'ready' ? view(this.tenants(), this.window()) : UNAVAILABLE_KPI;
  }
}
