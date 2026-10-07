import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChartCard } from './chart-card';
import type { ChartCardState, ChartTable, LegendItem } from './chart.models';

@Component({
  imports: [ChartCard],
  template: `
    <app-chart-card
      title="Raised over time"
      subtitle="Last 7 days"
      emptyText="No donations in this period."
      errorText="Couldn't load donations."
      [state]="state()"
      [legend]="legend()"
      [table]="table()"
      [retryable]="true"
      (retry)="retries.set(retries() + 1)"
    >
      <p class="projected-chart">chart</p>
    </app-chart-card>
  `,
})
class Host {
  public readonly state = signal<ChartCardState>('ready');
  public readonly legend = signal<LegendItem[]>([]);
  public readonly table = signal<ChartTable | null>({
    columns: [
      { key: 'category', label: 'Day' },
      { key: 'raised', label: 'Raised', numeric: true },
    ],
    rows: [
      { category: 'Mon', raised: 'GH₵ 10.00' },
      { category: 'Tue', raised: 'GH₵ 25.00' },
    ],
  });
  public readonly retries = signal(0);
}

describe('ChartCard', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    const settle = () => fixture.whenStable();
    return { el, host, settle };
  }

  const toggleOf = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('View as table'));
  const plotOf = (el: HTMLElement) => el.querySelector<HTMLElement>('.chart-card-plot');

  it('titles the card and shows the projected chart when ready', async () => {
    const { el } = await render();

    expect(el.querySelector('h2')?.textContent).toBe('Raised over time');
    expect(el.querySelector('article')?.getAttribute('aria-labelledby')).toBe(
      el.querySelector('h2')?.id,
    );
    expect(el.textContent).toContain('Last 7 days');
    expect(plotOf(el)?.hidden).toBe(false);
    expect(el.querySelector('.projected-chart')).not.toBeNull();
  });

  it('swaps the chart for a table and back, announcing the pressed state', async () => {
    const { el, settle } = await render();
    const toggle = toggleOf(el)!;

    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    await settle();

    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(plotOf(el)?.hidden).toBe(true);
    expect(el.querySelector('caption')?.textContent?.trim()).toBe('Raised over time');
    const headers = Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(headers).toEqual(['Day', 'Raised']);
    const firstRow = el.querySelector('tbody tr');
    expect(firstRow?.querySelector('th[scope="row"]')?.textContent).toBe('Mon');
    expect(firstRow?.querySelector('td.is-num')?.textContent).toBe('GH₵ 10.00');

    toggle.click();
    await settle();
    expect(el.querySelector('table')).toBeNull();
    expect(plotOf(el)?.hidden).toBe(false);
  });

  it('offers no table toggle without rows', async () => {
    const { el, host, settle } = await render();

    host.table.set(null);
    await settle();

    expect(toggleOf(el)).toBeUndefined();
  });

  it('shows a skeleton while loading, with the chart hidden', async () => {
    const { el, host, settle } = await render();

    host.state.set('loading');
    await settle();

    expect(el.querySelector('app-skeleton-rows [role="status"]')?.textContent).toContain(
      'Loading Raised over time',
    );
    expect(plotOf(el)?.hidden).toBe(true);
    expect(toggleOf(el)).toBeUndefined();
  });

  it('shows the empty text in place of the chart', async () => {
    const { el, host, settle } = await render();

    host.state.set('empty');
    await settle();

    expect(el.textContent).toContain('No donations in this period.');
    expect(plotOf(el)?.hidden).toBe(true);
  });

  it('announces an error and offers a retry', async () => {
    const { el, host, settle } = await render();

    host.state.set('error');
    await settle();
    const alert = el.querySelector('[role="alert"]');
    alert?.querySelector('button')?.click();

    expect(alert?.textContent).toContain("Couldn't load donations.");
    expect(host.retries()).toBe(1);
    expect(plotOf(el)?.hidden).toBe(true);
  });

  it('lists the series in an HTML legend once there are two or more', async () => {
    const { el, host, settle } = await render();

    host.legend.set([{ label: 'Cash', colorToken: '--series-1' }]);
    await settle();
    expect(el.querySelector('app-chart-legend')).toBeNull();

    host.legend.set([
      { label: 'Cash', colorToken: '--series-1', detail: 'GH₵ 7.00 · 70%' },
      { label: 'Mobile Money', colorToken: '--series-2' },
    ]);
    await settle();
    const items = Array.from(el.querySelectorAll('app-chart-legend li'));

    expect(items.map((li) => li.querySelector('.legend-label')?.textContent)).toEqual([
      'Cash',
      'Mobile Money',
    ]);
    expect(items[0].textContent).toContain('GH₵ 7.00 · 70%');
    expect(items[0].querySelector('.legend-swatch')?.getAttribute('aria-hidden')).toBe('true');
  });
});
