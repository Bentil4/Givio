export type TrendDirection = 'up' | 'down' | 'flat';

/** A KPI's change against the previous equal-length period. */
export interface KpiDelta {
  direction: TrendDirection;
  /** Whole percent, unsigned; null when there was nothing before to compare with. */
  percent: number | null;
  /** e.g. `vs previous 7 days`, or `New` when the previous period had nothing. */
  comparisonLabel: string;
}

/**
 * The change from `previous` to `current`. A rise from zero has no meaningful percentage, so it
 * reads as "New" rather than as an infinite or made-up figure.
 */
export function compareToPrevious(
  current: number,
  previous: number,
  comparisonLabel: string,
): KpiDelta {
  if (previous === 0) return changeFromZero(current, comparisonLabel);
  const percent = Math.round((Math.abs(current - previous) / previous) * 100);
  return { direction: directionOf(current - previous, percent), percent, comparisonLabel };
}

function changeFromZero(current: number, comparisonLabel: string): KpiDelta {
  if (current > 0) return { direction: 'up', percent: null, comparisonLabel: 'New' };
  return { direction: 'flat', percent: 0, comparisonLabel };
}

// A change that rounds to 0% reads as flat — an arrow beside "0%" would overstate it.
function directionOf(change: number, roundedPercent: number): TrendDirection {
  if (roundedPercent === 0) return 'flat';
  return change > 0 ? 'up' : 'down';
}
