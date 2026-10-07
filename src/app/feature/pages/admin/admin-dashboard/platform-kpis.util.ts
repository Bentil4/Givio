import type { Tenant } from '../../../../data/models/tenant';
import type {
  ApprovalCountsState,
  PendingApprovalCounts,
} from '../../../../data/models/approval-counts';
import type { DateRange } from '../../../../utils/dashboard-period.util';
import { compareToPrevious, type KpiDelta } from '../../../../utils/trend.util';
import {
  APPROVAL_TARGET_BUSINESS_DAYS,
  medianApprovalTurnaround,
  turnaroundStatus,
  type TurnaroundStatus,
} from './approval-turnaround.util';
import {
  countApprovalsIn,
  countCompaniesByStatus,
  countSignupsIn,
  formatCount,
} from './platform-metrics';

/** The selected period, the one before it, and how a change between them is worded. */
export interface PeriodWindow {
  readonly current: DateRange;
  readonly previous: DateRange;
  /** e.g. `vs previous 30 days`; null for All time, which has no previous period. */
  readonly comparisonLabel: string | null;
}

/** What one KPI tile shows, already formatted. */
export interface KpiView {
  readonly value: string;
  readonly hint: string;
  readonly delta: KpiDelta | null;
}

export interface TurnaroundView extends KpiView {
  readonly status: TurnaroundStatus | null;
}

/** A figure that couldn't be read shows as a gap, never as zero. */
export const UNAVAILABLE_KPI: KpiView = { value: '—', hint: 'Not available', delta: null };

const NO_TURNAROUND = { value: '—', hint: 'No applications approved this period' };

export const TURNAROUND_STATUS_TEXT: Record<TurnaroundStatus, string> = {
  'on-target': `Within the ${APPROVAL_TARGET_BUSINESS_DAYS}-business-day target`,
  'over-target': `Over the ${APPROVAL_TARGET_BUSINESS_DAYS}-business-day target`,
};

/** Active companies now; the change is in new approvals, which is what moves that number. */
export function activeCompaniesKpi(tenants: readonly Tenant[], window: PeriodWindow): KpiView {
  const statusCounts = countCompaniesByStatus(tenants);
  const approved = countApprovalsIn(tenants, window.current);
  const previous = countApprovalsIn(tenants, window.previous);
  return {
    value: formatCount(statusCounts.approved),
    hint: `${formatCount(approved)} approved this period · ${statusCounts.suspended} suspended`,
    delta: deltaBetween(approved, previous, labelled(window, 'in approvals')),
  };
}

export function newSignupsKpi(tenants: readonly Tenant[], window: PeriodWindow): KpiView {
  const signups = countSignupsIn(tenants, window.current);
  const previous = countSignupsIn(tenants, window.previous);
  return {
    value: formatCount(signups),
    hint: 'Companies that applied or were invited',
    delta: deltaBetween(signups, previous, window.comparisonLabel),
  };
}

export function approvalTurnaroundKpi(
  tenants: readonly Tenant[],
  window: PeriodWindow,
): TurnaroundView {
  const median = medianApprovalTurnaround(tenants, window.current);
  if (median === null) return { ...NO_TURNAROUND, delta: null, status: null };
  const previous = medianApprovalTurnaround(tenants, window.previous);
  return {
    value: `${median.toFixed(1)} days`,
    hint: 'Median from signup to approval, in business days',
    delta: previous === null ? null : deltaBetween(median, previous, window.comparisonLabel),
    status: turnaroundStatus(median),
  };
}

export function pendingApprovalsKpi(
  counts: PendingApprovalCounts,
  state: ApprovalCountsState,
): KpiView {
  if (state !== 'ready') return UNAVAILABLE_KPI;
  const { applications, identityReviews, duplicateEvents } = counts;
  return {
    value: formatCount(applications + identityReviews + duplicateEvents),
    hint: [
      plural(applications, 'application'),
      plural(identityReviews, 'flagged addition'),
      plural(duplicateEvents, 'duplicate event'),
    ].join(' · '),
    delta: null,
  };
}

export function openSupportKpi(openRequests: number | null): KpiView {
  if (openRequests === null) return UNAVAILABLE_KPI;
  return { value: formatCount(openRequests), hint: 'Questions and disputes', delta: null };
}

function deltaBetween(current: number, previous: number, label: string | null): KpiDelta | null {
  return label === null ? null : compareToPrevious(current, previous, label);
}

function labelled(window: PeriodWindow, subject: string): string | null {
  return window.comparisonLabel === null ? null : `${subject} ${window.comparisonLabel}`;
}

function plural(count: number, noun: string): string {
  return `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`;
}
