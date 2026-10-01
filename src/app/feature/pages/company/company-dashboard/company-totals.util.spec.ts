import { makeEvent } from '../../../../data/services/donation-data-test-fixtures';
import {
  LOADING_FIGURES,
  countLabel,
  isRunningEvent,
  summarizeEventTotals,
  type EventTotalRow,
} from './company-totals.util';

const loadedRow = (id: string, totalMinor: number, donorCount: number): EventTotalRow => ({
  event: makeEvent({ id }),
  figures: { status: 'loaded', figures: { totalMinor, donorCount } },
});

describe('company totals', () => {
  it('counts active and paused Events as running, never closed ones', () => {
    expect(isRunningEvent({ status: 'active' })).toBe(true);
    expect(isRunningEvent({ status: 'paused' })).toBe(true);
    expect(isRunningEvent({ status: 'closed' })).toBe(false);
  });

  it('sums every loaded Event and counts the ones that failed', () => {
    const rows: EventTotalRow[] = [
      loadedRow('e1', 50000, 3),
      loadedRow('e2', 2550, 1),
      { event: makeEvent({ id: 'e3', status: 'paused' }), figures: { status: 'failed' } },
      { event: makeEvent({ id: 'e4' }), figures: LOADING_FIGURES },
    ];

    expect(summarizeEventTotals(rows)).toEqual({
      totalMinor: 52550,
      donorCount: 4,
      runningCount: 4,
      activeCount: 3,
      failedCount: 1,
    });
  });

  it('is an explicit zero with no Events at all', () => {
    expect(summarizeEventTotals([])).toEqual({
      totalMinor: 0,
      donorCount: 0,
      runningCount: 0,
      activeCount: 0,
      failedCount: 0,
    });
  });

  it('pluralizes count labels', () => {
    expect(countLabel(1, 'donor')).toBe('1 donor');
    expect(countLabel(0, 'donor')).toBe('0 donors');
  });
});
