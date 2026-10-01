import type { Event, EventStatus } from '../../../../data/models/event';
import type { EventFigures } from '../../../../data/services/tenant-totals-data.service';

export type FiguresState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly figures: EventFigures }
  | { readonly status: 'failed' };

export interface EventTotalRow {
  readonly event: Event;
  readonly figures: FiguresState;
}

export interface ConsolidatedSummary {
  readonly totalMinor: number;
  readonly donorCount: number;
  readonly runningCount: number;
  readonly activeCount: number;
  readonly failedCount: number;
}

export const LOADING_FIGURES: FiguresState = { status: 'loading' };

/**
 * A paused Event is still running — the Organizer paused entries, the money already recorded
 * on it hasn't gone anywhere — so it stays in the total. Only a Closed Event drops out.
 */
const RUNNING_STATUSES: readonly EventStatus[] = ['active', 'paused'];

export function isRunningEvent(event: Pick<Event, 'status'>): boolean {
  return RUNNING_STATUSES.includes(event.status);
}

export function runningEvents(events: readonly Event[]): Event[] {
  return events.filter(isRunningEvent);
}

export function summarizeEventTotals(rows: readonly EventTotalRow[]): ConsolidatedSummary {
  const loaded = rows.flatMap((row) =>
    row.figures.status === 'loaded' ? [row.figures.figures] : [],
  );
  return {
    totalMinor: loaded.reduce((sum, figures) => sum + figures.totalMinor, 0),
    donorCount: loaded.reduce((sum, figures) => sum + figures.donorCount, 0),
    runningCount: rows.length,
    activeCount: rows.filter((row) => row.event.status === 'active').length,
    failedCount: rows.filter((row) => row.figures.status === 'failed').length,
  };
}

export function countLabel(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}
