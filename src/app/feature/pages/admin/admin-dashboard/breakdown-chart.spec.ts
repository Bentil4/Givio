import { TestBed } from '@angular/core/testing';
import { createFakeCharts, type FakeCharts } from '../../../../../testing/fake-chart';
import { BreakdownChart } from './breakdown-chart';
import type { CategoryCount } from './platform-metrics';

const ROLES: CategoryCount[] = [
  { key: 'admins', label: 'Admins', count: 1 },
  { key: 'operators', label: 'Operators', count: 3 },
  { key: 'companyAccounts', label: 'Company accounts', count: 0 },
];

describe('BreakdownChart', () => {
  let charts: FakeCharts;

  async function render(inputs: Record<string, unknown>) {
    charts = createFakeCharts();
    TestBed.configureTestingModule({ providers: [charts.provider] });
    const fixture = TestBed.createComponent(BreakdownChart);
    const defaults = {
      title: 'Users by role',
      items: ROLES,
      state: 'ready',
      categoryHeading: 'Role',
      countHeading: 'Users',
    };
    for (const [name, value] of Object.entries({ ...defaults, ...inputs })) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('draws a doughnut with one data-viz slot per part and counts beside each name', async () => {
    const { el } = await render({ kind: 'doughnut' });

    expect(charts.created[0].createdWith.type).toBe('doughnut');
    expect(el.querySelector('.chart-legend')?.textContent).toContain('3 · 75%');
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Users by role: Admins 1 (25%), Operators 3 (75%), Company accounts 0 (0%).',
    );
  });

  it('draws bars with a count summary and a table view', async () => {
    const { fixture, el } = await render({ title: 'Companies by status', horizontal: true });

    expect(charts.created[0].createdWith.type).toBe('bar');
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Companies by status: Admins 1, Operators 3, Company accounts 0.',
    );
    el.querySelector<HTMLButtonElement>('.table-toggle')!.click();
    await fixture.whenStable();
    const cells = [...el.querySelectorAll('tbody tr')].map((r) => r.textContent?.trim());
    expect(cells[1]).toContain('Operators');
  });

  it('offers a retry when its data failed to load', async () => {
    const { fixture, el } = await render({ state: 'error', errorText: "Couldn't load users." });
    const retried = vi.fn();
    fixture.componentInstance.retry.subscribe(retried);

    expect(el.textContent).toContain("Couldn't load users.");
    el.querySelector<HTMLButtonElement>('.chart-card-error button')!.click();

    expect(retried).toHaveBeenCalled();
  });

  it('says so when every count is zero', async () => {
    const empty = ROLES.map((role) => ({ ...role, count: 0 }));
    const { el } = await render({ items: empty, emptyText: 'No user accounts yet.' });

    expect(el.textContent).toContain('No user accounts yet.');
  });
});
