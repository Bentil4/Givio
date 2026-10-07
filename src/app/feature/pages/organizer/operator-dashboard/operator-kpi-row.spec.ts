import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createFakeCharts } from '../../../../../testing/fake-chart';
import type { OperatorKpis } from './operator-insights.util';
import { OperatorKpiRow } from './operator-kpi-row';

const KPIS: OperatorKpis = {
  raisedMinor: 30000,
  raisedDelta: { direction: 'up', percent: 50, comparisonLabel: 'vs same time yesterday' },
  donors: 3,
  donorsDelta: null,
  myCount: 2,
  myRaisedMinor: 10000,
};

describe('OperatorKpiRow', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), createFakeCharts().provider],
    });
  });

  async function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(OperatorKpiRow);
    const defaults = { kpis: KPIS, period: 'today', state: 'ready', pendingCount: 0 };
    for (const [name, value] of Object.entries({ ...defaults, ...inputs })) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const tiles = (el: HTMLElement) => [...el.querySelectorAll('app-kpi-tile')];
  const text = (el: Element) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('names each figure for the chosen period and shows its value', async () => {
    const el = await render({ scopeText: 'Every desk at Ama & Kojo' });
    const [raised, donors, mine] = tiles(el).map(text);

    expect(raised).toContain('Raised today');
    expect(raised).toContain('GH₵ 300');
    expect(raised).toContain('50% vs same time yesterday');
    expect(raised).toContain('Every desk at Ama & Kojo');
    expect(donors).toContain('Donors today');
    expect(mine).toContain('My recordings today');
    expect(mine).toContain('GH₵ 100.00 recorded by you');
  });

  it('follows the period in its labels', async () => {
    const el = await render({ period: 'all' });

    expect(text(tiles(el)[0])).toContain('Raised across your events');
  });

  it('shows a calm sync tile when nothing is waiting', async () => {
    const el = await render();
    const pending = tiles(el)[3];

    expect(pending.querySelector('.is-warning')).toBeNull();
    expect(text(pending)).toContain('Everything has synced');
    expect(pending.querySelector('a')).toBeNull();
  });

  it('warns with an icon, words and a link when donations are waiting to sync', async () => {
    const el = await render({ pendingCount: 2 });
    const pending = tiles(el)[3];

    expect(pending.querySelector('.is-warning')).not.toBeNull();
    expect(pending.querySelector('mat-icon')?.textContent?.trim()).toBe('warning');
    expect(text(pending)).toContain('2');
    expect(text(pending)).toContain('Saved on this device');
    expect(pending.querySelector('a')?.getAttribute('href')).toBe('/organizer/donations');
  });

  it('shows a visible gap, not a zero, when donations could not be loaded', async () => {
    const el = await render({ state: 'error' });
    const raised = text(tiles(el)[0]);

    expect(raised).toContain('—');
    expect(raised).toContain("Couldn't load");
    expect(raised).not.toContain('GH₵');
  });
});
