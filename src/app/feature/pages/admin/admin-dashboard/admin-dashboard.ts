import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceError } from '../../../../core/services/service-error';
import type { AdminUser } from '../../../../data/models/admin-user';
import type { Tenant } from '../../../../data/models/tenant';
import { ApprovalCountsService } from '../../../../data/services/approval-counts.service';
import { SupportRequestDataService } from '../../../../data/services/support-request-data.service';
import { TenantLifecycleDataService } from '../../../../data/services/tenant-lifecycle-data.service';
import { UserService } from '../../../../data/services/user.service';
import {
  COMPANY_STATUSES,
  COMPANY_STATUS_LABELS,
  countCompaniesByStatus,
  countUsersByRole,
} from './platform-metrics';

/**
 * Admin overview — platform governance only (AD-12, amended 2026-10-07): companies by status,
 * pending approvals, people and open support requests. Platform Admins have no access to
 * company Events or Donations, so nothing here totals or lists them.
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboard implements OnInit {
  private readonly tenantLifecycleData = inject(TenantLifecycleDataService);
  private readonly userService = inject(UserService);
  private readonly supportRequests = inject(SupportRequestDataService);
  private readonly approvalCounts = inject(ApprovalCountsService);

  private readonly tenants = signal<Tenant[]>([]);
  private readonly users = signal<AdminUser[]>([]);

  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  /** null when the count couldn't be read — shown as unavailable, never as zero. */
  public readonly openSupportRequests = signal<number | null>(null);

  public readonly statuses = COMPANY_STATUSES;
  public readonly statusLabels = COMPANY_STATUS_LABELS;
  public readonly companiesByStatus = computed(() => countCompaniesByStatus(this.tenants()));
  public readonly userCounts = computed(() => countUsersByRole(this.users()));
  public readonly pendingApprovals = this.approvalCounts.total;
  public readonly supportNote = computed(() => {
    if (this.openSupportRequests() !== null) return 'Questions and disputes';
    return this.loading() ? 'Loading' : 'Not available';
  });

  async ngOnInit(): Promise<void> {
    void this.approvalCounts.refresh();
    await Promise.all([this.loadCompaniesAndUsers(), this.loadOpenSupportRequests()]);
    this.loading.set(false);
  }

  private async loadCompaniesAndUsers(): Promise<void> {
    try {
      const [tenants, users] = await Promise.all([
        this.tenantLifecycleData.listTenants(),
        this.userService.listUsers(),
      ]);
      this.tenants.set(tenants);
      this.users.set(users);
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Failed to load the overview');
    }
  }

  private async loadOpenSupportRequests(): Promise<void> {
    try {
      this.openSupportRequests.set(await this.supportRequests.countOpenRequests());
    } catch {
      this.openSupportRequests.set(null);
    }
  }
}
