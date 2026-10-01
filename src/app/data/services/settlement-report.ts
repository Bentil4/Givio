import type { Donation } from '../models/donation';
import type { Event } from '../models/event';
import { totalMinor } from '../../utils/donation.util';
import {
  isWithinSettlementPeriod,
  type SettlementPeriod,
} from '../../utils/settlement-period.util';

export interface SettlementEventRow {
  eventName: string;
  eventDate: string;
  status: Event['status'];
  /** Donations whose recordedAt falls inside the period, in minor units (AD-5). */
  periodTotalMinor: number;
  /** Every donation the Event holds at export time, in minor units. */
  allTimeTotalMinor: number;
}

export interface SettlementReport {
  companyName: string;
  period: SettlementPeriod;
  rows: SettlementEventRow[];
  periodTotalMinor: number;
  allTimeTotalMinor: number;
}

export interface SettlementReportInput {
  companyName: string;
  period: SettlementPeriod;
  events: readonly Event[];
  donations: readonly Donation[];
}

/**
 * Story 8.5 (FR-22, AD-5): every figure is an integer sum of minor units through the same
 * totalMinor() the rest of the app totals with, and the grand totals are sums of the per-Event
 * rows — so the export reconciles to the pesewa with each Event's own total.
 */
export function buildSettlementReport(input: SettlementReportInput): SettlementReport {
  const rows = sortedByEventDate(input.events).map((event) =>
    settlementRowForEvent(event, donationsForEvent(input.donations, event.id), input.period),
  );
  return {
    companyName: input.companyName,
    period: input.period,
    rows,
    periodTotalMinor: sumOf(rows, 'periodTotalMinor'),
    allTimeTotalMinor: sumOf(rows, 'allTimeTotalMinor'),
  };
}

function sortedByEventDate(events: readonly Event[]): Event[] {
  return [...events].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

function donationsForEvent(donations: readonly Donation[], eventId: string): Donation[] {
  return donations.filter((donation) => donation.eventId === eventId);
}

function settlementRowForEvent(
  event: Event,
  donations: readonly Donation[],
  period: SettlementPeriod,
): SettlementEventRow {
  const inPeriod = donations.filter((d) => isWithinSettlementPeriod(d.recordedAt, period));
  return {
    eventName: event.name,
    eventDate: event.date,
    status: event.status,
    periodTotalMinor: totalMinor(inPeriod),
    allTimeTotalMinor: totalMinor(donations),
  };
}

function sumOf(
  rows: readonly SettlementEventRow[],
  field: 'periodTotalMinor' | 'allTimeTotalMinor',
): number {
  return rows.reduce((sum, row) => sum + row[field], 0);
}
