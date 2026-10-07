import type { Tenant } from '../../../../data/models/tenant';
import { isWithinRange, type DateRange } from '../../../../utils/dashboard-period.util';
import { isApprovedCompany, type ApprovedTenant } from './platform-metrics';

/** PRD SM-1: a self-signup is approved within 3 business days. */
export const APPROVAL_TARGET_BUSINESS_DAYS = 3;

export type TurnaroundStatus = 'on-target' | 'over-target';

const DAY_MS = 24 * 3_600_000;
const SATURDAY = 6;
const SUNDAY = 0;

/**
 * The median business days from signup to approval for the self-signups approved in `range`;
 * null when none were. An Admin-invited company is approved as it is created, with no document
 * to review, so it is left out rather than pulling the median down to zero.
 */
export function medianApprovalTurnaround(
  tenants: readonly Tenant[],
  range: DateRange,
): number | null {
  const days = tenants
    .filter(isReviewedSignup)
    .filter((tenant) => isWithinRange(tenant.verifiedAt, range))
    .map((tenant) => businessDaysBetween(tenant.createdAt, tenant.verifiedAt));
  return medianOf(days);
}

export function turnaroundStatus(medianBusinessDays: number): TurnaroundStatus {
  return medianBusinessDays <= APPROVAL_TARGET_BUSINESS_DAYS ? 'on-target' : 'over-target';
}

/**
 * The time between two instants that falls on a weekday, in days. Accra is UTC+0 all year, so
 * UTC days are its business days; public holidays are not known here and count as working days.
 */
export function businessDaysBetween(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  let weekdayMs = 0;
  for (let day = utcDayStart(start); day < end; day += DAY_MS) {
    weekdayMs += weekdayOverlapMs(day, start, end);
  }
  return weekdayMs / DAY_MS;
}

function isReviewedSignup(tenant: Tenant): tenant is ApprovedTenant {
  return isApprovedCompany(tenant) && Boolean(tenant.verificationDocumentId);
}

function weekdayOverlapMs(dayStart: number, start: number, end: number): number {
  if (isWeekend(dayStart)) return 0;
  return Math.max(0, Math.min(end, dayStart + DAY_MS) - Math.max(start, dayStart));
}

function isWeekend(dayStart: number): boolean {
  const weekday = new Date(dayStart).getUTCDay();
  return weekday === SATURDAY || weekday === SUNDAY;
}

function utcDayStart(time: number): number {
  return Math.floor(time / DAY_MS) * DAY_MS;
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
