import { readOperatorPeriod, storeOperatorPeriod } from './operator-period';

describe('operator period', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to Today when nothing is remembered', () => {
    expect(readOperatorPeriod('op-1')).toBe('today');
  });

  it('remembers the choice per user', () => {
    storeOperatorPeriod('op-1', 'all');

    expect(readOperatorPeriod('op-1')).toBe('all');
    expect(readOperatorPeriod('op-2')).toBe('today');
  });

  it('ignores a stored value that is not an operator period', () => {
    localStorage.setItem('givio.dashboard-period.operator.op-1', '7d');

    expect(readOperatorPeriod('op-1')).toBe('today');
  });
});
