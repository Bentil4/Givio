import { TestBed } from '@angular/core/testing';
import { ThemeService } from '../../../core/services/theme.service';
import { createFakeCharts, type FakeCharts } from '../../../../testing/fake-chart';
import { DashboardChart } from './chart';
import type { ChartKind, ChartSeries } from './chart.models';

describe('DashboardChart', () => {
  let charts: FakeCharts;

  const raised: ChartSeries = {
    key: 'raised',
    label: 'Raised',
    values: [1000, 2500, 0],
    colorToken: '--series-1',
  };

  beforeEach(() => {
    charts = createFakeCharts();
    TestBed.configureTestingModule({ providers: [charts.provider] });
  });

  async function render(kind: ChartKind = 'line', series: ChartSeries[] = [raised]) {
    const fixture = TestBed.createComponent(DashboardChart);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('labels', ['Mon', 'Tue', 'Wed']);
    fixture.componentRef.setInput('series', series);
    fixture.componentRef.setInput('ariaSummary', 'Raised per day: total GH₵ 35.00');
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('names the canvas for assistive tech with the summary', async () => {
    const { el } = await render();
    const frame = el.querySelector('[role="img"]');

    expect(frame?.getAttribute('aria-label')).toBe('Raised per day: total GH₵ 35.00');
    expect(frame?.querySelector('canvas')).not.toBeNull();
  });

  it('creates one chart on its own canvas with the series and labels', async () => {
    const { el } = await render();

    expect(charts.created).toHaveLength(1);
    const [chart] = charts.created;
    expect(chart.canvas).toBe(el.querySelector('canvas'));
    expect(chart.createdWith.type).toBe('line');
    expect(chart.createdWith.data.labels).toEqual(['Mon', 'Tue', 'Wed']);
    expect(chart.createdWith.data.datasets[0].data).toEqual([1000, 2500, 0]);
  });

  it('updates the same chart in place when its data changes', async () => {
    const { fixture } = await render();

    fixture.componentRef.setInput('series', [{ ...raised, values: [5, 6, 7] }]);
    await fixture.whenStable();

    expect(charts.created).toHaveLength(1);
    expect(charts.created[0].updates).toBe(1);
    expect(charts.created[0].data.datasets[0].data).toEqual([5, 6, 7]);
  });

  it('replaces the chart when its kind changes', async () => {
    const { fixture } = await render('line');

    fixture.componentRef.setInput('kind', 'bar');
    await fixture.whenStable();

    expect(charts.created).toHaveLength(2);
    expect(charts.created[0].destroyed).toBe(true);
    expect(charts.created[1].createdWith.type).toBe('bar');
  });

  it('re-renders when the theme changes, so colours are re-read', async () => {
    await render();
    const theme = TestBed.inject(ThemeService);

    theme.setPreference(theme.theme() === 'dark' ? 'light' : 'dark');
    TestBed.tick();

    expect(charts.created[0].updates).toBe(1);
    localStorage.clear();
  });

  it('destroys the chart with the component', async () => {
    const { fixture } = await render();

    fixture.destroy();

    expect(charts.created[0].destroyed).toBe(true);
  });

  it('draws a doughnut with one arc per series', async () => {
    const slices: ChartSeries[] = [
      { key: 'cash', label: 'Cash', values: [700], colorToken: '--series-1' },
      { key: 'momo', label: 'Mobile Money', values: [300], colorToken: '--series-2' },
    ];
    await render('doughnut', slices);

    const config = charts.created[0].createdWith;
    expect(config.data.labels).toEqual(['Cash', 'Mobile Money']);
    expect(config.data.datasets[0].data).toEqual([700, 300]);
  });
});
