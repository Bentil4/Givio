import type { Donation } from '../../../../data/models/donation';
import type { Event } from '../../../../data/models/event';
import type { ChartCardState } from '../../../../shared/components/dashboard';
import type { TenantSettlementData } from '../../../../data/services/settlement-data.service';
import {
  bucketsFor,
  comparisonLabelFor,
  periodRange,
  previousRange,
  type DashboardPeriod,
  type DateRange,
  type PeriodBucket,
} from '../../../../utils/dashboard-period.util';
import { giftAverages } from '../../../../utils/donation-breakdown.util';
import {
  donationsInRange,
  donorCount,
  raisedSeries,
} from '../../../../utils/donation-insights.util';
import { countedDonations, formatCedisShort, totalMinor } from '../../../../utils/donation.util';
import { compareToPrevious, type KpiDelta } from '../../../../utils/trend.util';
import { runningEvents } from './company-totals.util';

/** Where the one insights read stands; a failed background refresh keeps it `ready`. */
export type InsightsStatus = 'loading' | 'ready' | 'error';

/** The stretch of time a dashboard shows, and the equal stretch before it that it compares to. */
export interface PeriodWindow {
  period: DashboardPeriod;
  range: DateRange;
  /** Null for All time, which has nothing before it. */
  previous: DateRange | null;
  comparisonLabel: string | null;
  buckets: PeriodBucket[];
}

/** The company's counted donations split into this period and the one before it. */
export interface CompanyInsights {
  window: PeriodWindow;
  events: readonly Event[];
  current: readonly Donation[];
  previous: readonly Donation[];
}

export interface KpiFigure {
  value: string;
  delta: KpiDelta | null;
  hint: string;
}

export interface CompanyKpis {
  raised: KpiFigure & { sparkline: number[] };
  donors: KpiFigure;
  averageGift: KpiFigure;
  runningEvents: KpiFigure;
}

/**
 * Derives everything the dashboard shows from one read. Only counted donations go in, so a
 * removed, in-conflict or rejected record never reaches a figure or a chart.
 */
export function companyInsights(
  data: TenantSettlementData,
  period: DashboardPeriod,
  now: Date,
): CompanyInsights {
  const counted = countedDonations(data.donations);
  const window = periodWindow(period, now, earliestRecordedAt(counted));
  return {
    window,
    events: data.events,
    current: donationsInRange(counted, window.range),
    previous: window.previous ? donationsInRange(counted, window.previous) : [],
  };
}

export function periodWindow(period: DashboardPeriod, now: Date, earliest?: string): PeriodWindow {
  const range = periodRange(period, now, earliest);
  const comparisonLabel = comparisonLabelFor(period);
  return {
    period,
    range,
    previous: comparisonLabel === null ? null : previousRange(range),
    comparisonLabel,
    buckets: bucketsFor(range, period),
  };
}

/** A chart card's state: loading and error come from the read, empty from the data. */
export function insightCardState(status: InsightsStatus, hasData: boolean): ChartCardState {
  if (status !== 'ready') return status;
  return hasData ? 'ready' : 'empty';
}

export function companyKpis(insights: CompanyInsights): CompanyKpis {
  return {
    raised: raisedKpi(insights),
    donors: donorsKpi(insights),
    averageGift: averageGiftKpi(insights),
    runningEvents: runningEventsKpi(insights.events),
  };
}

/** The newest `count` donations in the period, newest first. */
export function latestDonations(donations: readonly Donation[], count: number): Donation[] {
  return [...donations].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, count);
}

/** Running events dated today or later (Accra calendar day), soonest first. */
export function upcomingEvents(events: readonly Event[], now: Date, count: number): Event[] {
  const today = now.toISOString().slice(0, 10);
  return runningEvents(events)
    .filter((event) => event.date.slice(0, 10) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, count);
}

function raisedKpi(insights: CompanyInsights): CompanyKpis['raised'] {
  const raised = totalMinor(insights.current);
  return {
    value: formatCedisShort(raised),
    delta: deltaFor(insights.window, raised, totalMinor(insights.previous)),
    hint: '',
    sparkline: raisedSeries(insights.current, insights.window.buckets),
  };
}

function donorsKpi(insights: CompanyInsights): KpiFigure {
  const donors = donorCount(insights.current);
  return {
    value: donors.toLocaleString('en-GH'),
    delta: deltaFor(insights.window, donors, donorCount(insights.previous)),
    hint: '',
  };
}

// A period of in-kind gifts only has no average, so it shows a dash and no change.
function averageGiftKpi(insights: CompanyInsights): KpiFigure {
  const current = giftAverages(insights.current);
  const previous = giftAverages(insights.previous);
  if (current.averageMinor === null) {
    return { value: '—', delta: null, hint: 'No cash or mobile money gifts yet' };
  }
  return {
    value: formatCedisShort(current.averageMinor),
    delta: deltaFor(insights.window, current.averageMinor, previous.averageMinor ?? 0),
    hint: `Median ${formatCedisShort(current.medianMinor ?? 0)}`,
  };
}

function runningEventsKpi(events: readonly Event[]): KpiFigure {
  const running = runningEvents(events);
  const active = running.filter((event) => event.status === 'active').length;
  return {
    value: String(running.length),
    delta: null,
    hint: `${active} active · ${running.length - active} paused`,
  };
}

function deltaFor(window: PeriodWindow, current: number, previous: number): KpiDelta | null {
  const label = window.comparisonLabel;
  return label === null ? null : compareToPrevious(current, previous, label);
}

function earliestRecordedAt(donations: readonly Donation[]): string | undefined {
  return donations.reduce<string | undefined>(
    (earliest, d) => (earliest === undefined || d.recordedAt < earliest ? d.recordedAt : earliest),
    undefined,
  );
}
