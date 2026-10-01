import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ServiceError } from '../../../../core/services/service-error';
import { ReportService } from '../../../../data/services/report.service';
import { SettlementDataService } from '../../../../data/services/settlement-data.service';
import {
  buildSettlementReport,
  type SettlementReport,
} from '../../../../data/services/settlement-report';
import { TenantService } from '../../../../data/services/tenant.service';
import type { Tenant } from '../../../../data/models/tenant';
import { formatCedis } from '../../../../utils/donation.util';
import {
  completedSettlementPeriods,
  firstSettlementPeriod,
  formatSettlementDate,
  type SettlementPeriod,
} from '../../../../utils/settlement-period.util';

/**
 * Story 8.5 (FR-22): a Super Organizer exports one completed calendar month of their company's
 * donations — one row per Event plus a grand total — built from a fresh server read at export
 * time so it reconciles with the live per-Event totals.
 */
@Component({
  selector: 'app-company-reports',
  imports: [ReactiveFormsModule, MatIconModule],
  templateUrl: './company-reports.html',
  styleUrl: './company-reports.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyReports {
  private readonly tenant = inject(TenantService).tenant;
  private readonly settlementData = inject(SettlementDataService);
  private readonly reportService = inject(ReportService);
  private readonly openedAt = new Date();

  public readonly generating = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly lastExport = signal<SettlementReport | null>(null);

  public readonly periods = computed(() =>
    completedSettlementPeriods(approvalTimeOf(this.tenant()), this.openedAt),
  );

  public readonly firstPeriodNotice = computed(() => {
    const first = firstSettlementPeriod(approvalTimeOf(this.tenant()));
    const opensOn = formatSettlementDate(first.endsAt);
    return `Your first period is ${first.label}; its export opens on ${opensOn}.`;
  });

  public readonly periodForm = inject(FormBuilder).nonNullable.group({
    period: [this.periods()[0]?.key ?? ''],
  });

  public readonly exportSummary = computed(() => {
    const report = this.lastExport();
    return report ? describeExport(report) : null;
  });

  public async generateExport(): Promise<void> {
    const tenant = this.tenant();
    const period = this.periods().find((p) => p.key === this.periodForm.controls.period.value);
    if (this.generating() || !tenant || !period) return;
    this.generating.set(true);
    this.error.set(null);
    try {
      this.lastExport.set(await this.exportSettlementFile(tenant, period));
    } catch (err) {
      this.error.set(err instanceof ServiceError ? err.message : "We couldn't prepare the export");
    } finally {
      this.generating.set(false);
    }
  }

  /** The one place this page writes a file. */
  private async exportSettlementFile(
    tenant: Tenant,
    period: SettlementPeriod,
  ): Promise<SettlementReport> {
    const { events, donations } = await this.settlementData.loadTenantSettlementData(tenant.id);
    const report = buildSettlementReport({ companyName: tenant.name, period, events, donations });
    this.reportService.exportSettlementXlsx(report);
    return report;
  }
}

/**
 * The approval moment itself isn't stored. verifiedAt (Story 6.5) is stamped by the Admin
 * review that approval requires, so it's the closest recorded time; createdAt covers a tenant
 * approved before verifiedAt existed.
 */
function approvalTimeOf(tenant: Tenant | null): string {
  return tenant?.verifiedAt ?? tenant?.createdAt ?? new Date().toISOString();
}

function describeExport(report: SettlementReport): string {
  const events = report.rows.length === 1 ? '1 event' : `${report.rows.length} events`;
  const total = formatCedis(report.periodTotalMinor);
  return `Exported ${report.period.label}: ${total} across ${events}.`;
}
