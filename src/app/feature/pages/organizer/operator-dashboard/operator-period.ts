import type { PeriodOption } from '../../../../shared/components/dashboard';
import { readStoredPeriod, storePeriod } from '../../../../utils/dashboard-period.util';

/** An Operator's dashboard scope: today at the picked Event, all of it, or all their Events. */
export type OperatorPeriod = 'today' | 'event' | 'all';

export const DEFAULT_OPERATOR_PERIOD: OperatorPeriod = 'today';

export const OPERATOR_PERIOD_OPTIONS: readonly PeriodOption<OperatorPeriod>[] = [
  { value: 'today', label: 'Today' },
  { value: 'event', label: 'This event' },
  { value: 'all', label: 'All my events' },
];

const OPERATOR_PERIODS = OPERATOR_PERIOD_OPTIONS.map((option) => option.value);

/** Finishes a KPI label, e.g. "Raised today" or "Donors across your events". */
export const PERIOD_PHRASES: Record<OperatorPeriod, string> = {
  today: 'today',
  event: 'at this event',
  all: 'across your events',
};

export const EMPTY_PERIOD_TEXT: Record<OperatorPeriod, string> = {
  today: "No donations yet today — they'll appear here as you record them.",
  event: "No donations at this event yet — they'll appear here as you record them.",
  all: "No donations across your events yet — they'll appear here as you record them.",
};

// Per user, so two Operators sharing a desk tablet each keep their own choice.
function storageKeyFor(userId: string): string {
  return `givio.dashboard-period.operator.${userId}`;
}

export function readOperatorPeriod(userId: string): OperatorPeriod {
  return readStoredPeriod(storageKeyFor(userId), OPERATOR_PERIODS) ?? DEFAULT_OPERATOR_PERIOD;
}

export function storeOperatorPeriod(userId: string, period: OperatorPeriod): void {
  storePeriod(storageKeyFor(userId), period);
}
