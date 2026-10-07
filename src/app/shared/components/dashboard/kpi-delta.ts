import type { KpiDelta, TrendDirection } from '../../../utils/trend.util';

/** Whether a rise is good news (money raised) or bad news (pending approvals, waiting time). */
export type GoodDirection = 'up' | 'down';

export type DeltaTone = 'good' | 'bad' | 'neutral';

/** How a delta reads: an icon, words for screen readers, visible text and a supporting tone. */
export interface DeltaView {
  icon: string;
  /** Read before the visible text, since the arrow icon itself is hidden from assistive tech. */
  spokenDirection: string;
  text: string;
  tone: DeltaTone;
}

const ICONS: Record<TrendDirection, string> = {
  up: 'arrow_upward',
  down: 'arrow_downward',
  flat: 'remove',
};

const SPOKEN: Record<TrendDirection, string> = { up: 'Up', down: 'Down', flat: '' };

/** e.g. ▲ "12% vs previous 7 days", ▲ "New", or — "No change vs previous 7 days". */
export function describeDelta(delta: KpiDelta, goodDirection: GoodDirection): DeltaView {
  return {
    icon: ICONS[delta.direction],
    spokenDirection: delta.percent === null ? '' : SPOKEN[delta.direction],
    text: deltaText(delta),
    tone: deltaTone(delta, goodDirection),
  };
}

function deltaText(delta: KpiDelta): string {
  if (delta.percent === null) return delta.comparisonLabel;
  if (delta.direction === 'flat') return `No change ${delta.comparisonLabel}`;
  return `${delta.percent}% ${delta.comparisonLabel}`;
}

// "New" has no size to judge, and flat is neither good nor bad — both stay neutral.
function deltaTone(delta: KpiDelta, goodDirection: GoodDirection): DeltaTone {
  if (delta.percent === null || delta.direction === 'flat') return 'neutral';
  return delta.direction === goodDirection ? 'good' : 'bad';
}
