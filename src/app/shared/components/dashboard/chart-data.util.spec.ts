import {
  describeSlices,
  describeTrend,
  legendFor,
  seriesTable,
  sliceLegend,
  sliceTable,
} from './chart-data.util';
import type { ChartSeries } from './chart.models';

describe('chart data helpers', () => {
  const format = (value: number) => `GH₵ ${value}`;
  const slices: ChartSeries[] = [
    { key: 'cash', label: 'Cash', values: [700], colorToken: '--series-1' },
    { key: 'momo', label: 'Mobile Money', values: [300], colorToken: '--series-2' },
    { key: 'kind', label: 'In-Kind', values: [0], colorToken: '--series-3' },
  ];

  it('builds a legend entry per series', () => {
    expect(legendFor(slices.slice(0, 2))).toEqual([
      { label: 'Cash', colorToken: '--series-1' },
      { label: 'Mobile Money', colorToken: '--series-2' },
    ]);
  });

  it('labels each doughnut arc with its value and share', () => {
    expect(sliceLegend(slices, format).map((item) => item.detail)).toEqual([
      'GH₵ 700 · 70%',
      'GH₵ 300 · 30%',
      'GH₵ 0 · 0%',
    ]);
  });

  it('tabulates a doughnut as one row per arc', () => {
    const table = sliceTable({
      series: slices,
      valueFormat: format,
      labelHeading: 'Type',
      valueHeading: 'Raised',
    });

    expect(table.columns.map((c) => c.label)).toEqual(['Type', 'Raised', 'Share']);
    expect(table.rows[0]).toEqual({ category: 'Cash', value: 'GH₵ 700', share: '70%' });
  });

  it('tabulates a line or bar chart as one row per label, one column per series', () => {
    const table = seriesTable({
      labels: ['Mon', 'Tue'],
      series: [
        { key: 'signups', label: 'Signups', values: [3, 5], colorToken: '--series-1' },
        { key: 'approvals', label: 'Approvals', values: [1], colorToken: '--series-2' },
      ],
      valueFormat: String,
      labelHeading: 'Day',
    });

    expect(table.columns).toEqual([
      { key: 'category', label: 'Day' },
      { key: 'signups', label: 'Signups', numeric: true },
      { key: 'approvals', label: 'Approvals', numeric: true },
    ]);
    expect(table.rows).toEqual([
      { category: 'Mon', signups: '3', approvals: '1' },
      { category: 'Tue', signups: '5', approvals: '0' },
    ]);
  });

  it('summarises shares for a screen reader', () => {
    expect(describeSlices('By type', slices, format)).toBe(
      'By type: Cash GH₵ 700 (70%), Mobile Money GH₵ 300 (30%), In-Kind GH₵ 0 (0%).',
    );
  });

  it('summarises a trend by its span, total and highest point', () => {
    expect(
      describeTrend({
        title: 'Raised per day',
        labels: ['1 Oct', '2 Oct', '3 Oct'],
        values: [100, 400, 50],
        valueFormat: format,
      }),
    ).toBe('Raised per day, 1 Oct to 3 Oct: total GH₵ 550, highest GH₵ 400 at 2 Oct.');
    expect(describeTrend({ title: 'Raised', labels: [], values: [], valueFormat: format })).toBe(
      'Raised: no data.',
    );
  });
});
