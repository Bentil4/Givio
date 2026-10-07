import { Injectable, inject, resource } from '@angular/core';
import { ApprovalCountsService } from '../../../../data/services/approval-counts.service';
import { AuditLogDataService } from '../../../../data/services/audit-log-data.service';
import { SupportRequestDataService } from '../../../../data/services/support-request-data.service';
import { TenantLifecycleDataService } from '../../../../data/services/tenant-lifecycle-data.service';
import { UserService } from '../../../../data/services/user.service';

const RECENT_ACTIVITY_LIMIT = 8;

/**
 * Every read the Admin overview makes — and the whole list of them. AD-12 (amended 2026-10-07):
 * platform Admins have no access to company Events or Donations, so nothing here reads, counts
 * or totals them. Each source loads and retries on its own, so one failure blanks one card.
 * Pending approval counts come from the shared badge service the admin layout already polls.
 */
@Injectable()
export class AdminDashboardData {
  private readonly tenantLifecycleData = inject(TenantLifecycleDataService);
  private readonly userService = inject(UserService);
  private readonly supportRequests = inject(SupportRequestDataService);
  private readonly auditLogs = inject(AuditLogDataService);
  private readonly approvalCounts = inject(ApprovalCountsService);

  public readonly tenants = resource({ loader: () => this.tenantLifecycleData.listTenants() });
  public readonly users = resource({ loader: () => this.userService.listUsers() });
  public readonly openSupportRequests = resource({
    loader: () => this.supportRequests.countOpenRequests(),
  });
  public readonly recentActivity = resource({
    loader: () => this.auditLogs.listRecentAuditLogs(RECENT_ACTIVITY_LIMIT),
  });
  public readonly pendingApprovals = this.approvalCounts.counts;
  public readonly pendingApprovalsState = this.approvalCounts.state;
}
