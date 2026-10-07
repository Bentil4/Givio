import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { KpiDelta } from '../../../utils/trend.util';
import { createFakeCharts, type FakeCharts } from '../../../../testing/fake-chart';
import { KpiTile } from './kpi-tile';

describe('KpiTile', () => {
  let charts: FakeCharts;

  beforeEach(() => {
    charts = createFakeCharts();
    TestBed.configureTestingModule({ providers: [provideRouter([]), charts.provider] });
  });

  async function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(KpiTile);
    fixture.componentRef.setInput('label', 'Raised');
    fixture.componentRef.setInput('value', 'GH₵ 4,200');
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const deltaOf = (el: HTMLElement) => el.querySelector('.kpi-delta');
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('shows the label and the value', async () => {
    const el = await render({});

    expect(text(el.querySelector('.stat-label'))).toBe('Raised');
    expect(text(el.querySelector('.stat-value'))).toBe('GH₵ 4,200');
    expect(deltaOf(el)).toBeNull();
  });

  it('reads a rise as an up arrow plus words, coloured as good news', async () => {
    const delta: KpiDelta = { direction: 'up', percent: 12, comparisonLabel: 'vs previous 7 days' };
    const el = await render({ delta });
    const line = deltaOf(el);

    expect(line?.querySelector('mat-icon')?.textContent?.trim()).toBe('arrow_upward');
    expect(line?.querySelector('mat-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(text(line?.querySelector('.visually-hidden') ?? null)).toBe('Up');
    expect(text(line)).toContain('12% vs previous 7 days');
    expect(line?.classList).toContain('is-good');
  });

  it('marks a fall as bad news, or good news when down is the good direction', async () => {
    const delta: KpiDelta = { direction: 'down', percent: 30, comparisonLabel: 'vs yesterday' };

    const el = await render({ delta });
    expect(deltaOf(el)?.querySelector('mat-icon')?.textContent?.trim()).toBe('arrow_downward');
    expect(text(deltaOf(el)?.querySelector('.visually-hidden') ?? null)).toBe('Down');
    expect(deltaOf(el)?.classList).toContain('is-bad');

    const inverted = await render({ delta, goodDirection: 'down' });
    expect(deltaOf(inverted)?.classList).toContain('is-good');
  });

  it('reads a rise from nothing as New, in neutral colour', async () => {
    const delta: KpiDelta = { direction: 'up', percent: null, comparisonLabel: 'New' };
    const el = await render({ delta });

    expect(text(deltaOf(el))).toBe('arrow_upward New');
    expect(deltaOf(el)?.querySelector('.visually-hidden')).toBeNull();
    expect(deltaOf(el)?.classList).toContain('is-neutral');
  });

  it('reads no change with a dash icon', async () => {
    const delta: KpiDelta = { direction: 'flat', percent: 0, comparisonLabel: 'vs yesterday' };
    const el = await render({ delta });

    expect(deltaOf(el)?.querySelector('mat-icon')?.textContent?.trim()).toBe('remove');
    expect(text(deltaOf(el))).toContain('No change vs yesterday');
    expect(deltaOf(el)?.classList).toContain('is-neutral');
  });

  it('links to the detail with a name that includes its visible text', async () => {
    const el = await render({ link: '/dashboard/approvals', linkLabel: 'Review' });
    const link = el.querySelector('a');

    expect(link?.getAttribute('href')).toBe('/dashboard/approvals');
    expect(link?.getAttribute('aria-label')).toBe('Review: Raised');
  });

  it('draws a decorative compact sparkline when given a trend', async () => {
    const el = await render({ sparkline: [1, 4, 2] });

    expect(el.querySelector('.kpi-spark')?.getAttribute('aria-hidden')).toBe('true');
    expect(charts.created).toHaveLength(1);
    expect(charts.created[0].createdWith.data.datasets[0].data).toEqual([1, 4, 2]);
    expect(charts.created[0].createdWith.options?.plugins?.tooltip?.enabled).toBe(false);
  });

  it('hides the value while loading and says so to assistive tech', async () => {
    const el = await render({ loading: true });

    expect(el.querySelector('.stat-value')).toBeNull();
    expect(el.querySelector('article')?.getAttribute('aria-busy')).toBe('true');
    expect(text(el.querySelector('.visually-hidden'))).toBe('Loading Raised');
  });

  it('flags a warning with an icon as well as the edge colour', async () => {
    const el = await render({ tone: 'warning', hint: '3 waiting to sync' });

    expect(el.querySelector('article')?.classList).toContain('is-warning');
    expect(el.querySelector('.kpi-warning-icon')?.textContent?.trim()).toBe('warning');
    expect(text(el.querySelector('.is-muted'))).toBe('3 waiting to sync');
  });
});
