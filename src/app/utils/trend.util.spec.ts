import { compareToPrevious } from './trend.util';

describe('compareToPrevious', () => {
  const label = 'vs previous 7 days';

  it('reports a rise as an unsigned whole percent', () => {
    expect(compareToPrevious(1120, 1000, label)).toEqual({
      direction: 'up',
      percent: 12,
      comparisonLabel: label,
    });
  });

  it('reports a fall as an unsigned whole percent', () => {
    expect(compareToPrevious(750, 1000, label)).toEqual({
      direction: 'down',
      percent: 25,
      comparisonLabel: label,
    });
  });

  it('reads a change that rounds to 0% as flat', () => {
    expect(compareToPrevious(1004, 1000, label)).toEqual({
      direction: 'flat',
      percent: 0,
      comparisonLabel: label,
    });
  });

  it('reads a rise from nothing as New, with no made-up percentage', () => {
    expect(compareToPrevious(500, 0, label)).toEqual({
      direction: 'up',
      percent: null,
      comparisonLabel: 'New',
    });
  });

  it('reads nothing against nothing as flat', () => {
    expect(compareToPrevious(0, 0, label)).toEqual({
      direction: 'flat',
      percent: 0,
      comparisonLabel: label,
    });
  });

  it('reads a drop to nothing as down 100%', () => {
    expect(compareToPrevious(0, 400, label)).toEqual({
      direction: 'down',
      percent: 100,
      comparisonLabel: label,
    });
  });
});
