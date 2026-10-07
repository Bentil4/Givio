import { TestBed } from '@angular/core/testing';
import { makeDonation } from '../../../../data/models/donation-test-fixtures';
import { makeEvent } from '../../../../data/services/donation-data-test-fixtures';
import { ServiceError } from '../../../../core/services/service-error';
import { CompanyDashboard } from './company-dashboard';
import { CompanyInsightsStore } from './company-insights.store';
import {
  DASHBOARD_USER_ID,
  setUpCompanyDashboard,
  settle,
  type DashboardBackend,
} from './company-dashboard-test-fixtures';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const PERIOD_KEY = `givio:dashboard-period:company:${DASHBOARD_USER_ID}`;

const events = [
  makeEvent({ id: 'e1', name: 'Odoi Funeral', date: '2026-10-20' }),
  makeEvent({ id: 'e2', name: 'Mensah Wedding', date: '2026-10-09', status: 'paused' }),
];

const donations = [
  makeDonation({ id: 'a', eventId: 'e1', amountMinor: 30000, recordedAt: '2026-10-07T09:00:00Z' }),
  makeDonation({
    id: 'b',
    eventId: 'e2',
    donorName: 'Kofi Mensah',
    amountMinor: 10000,
    recordedBy: 'op-2',
    recordedAt: '2026-10-07T10:30:00Z',
  }),
  makeDonation({ id: 'c', eventId: 'e1', amountMinor: 20000, recordedAt: '2026-09-01T09:00:00Z' }),
];

describe('CompanyDashboard insights', () => {
  let backend: DashboardBackend;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    backend = setUpCompanyDashboard();
    backend.listTenantEvents.mockResolvedValue(events);
    backend.loadEventFigures.mockResolvedValue({ totalMinor: 0, donorCount: 0 });
    backend.loadTenantSettlementData.mockResolvedValue({ events, donations });
    backend.listTeamMembersIncludingRevoked.mockResolvedValue([
      { userId: 'op-1', name: 'Ama Owusu' },
      { userId: 'op-2', name: 'Yaw Boateng' },
    ]);
  });

  afterEach(() => vi.useRealTimers());

  async function render() {
    const fixture = TestBed.createComponent(CompanyDashboard);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const kpiTexts = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('app-kpi-tile')).map((tile) => tile.textContent ?? '');
  const cardTitles = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('app-chart-card h2')).map((h) => h.textContent?.trim());
  const segment = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
      (button) => button.textContent?.trim() === label,
    );

  it('reads the company once and shows the 30-day figures by default', async () => {
    const { el } = await render();

    expect(backend.loadTenantSettlementData).toHaveBeenCalledOnce();
    expect(backend.loadTenantSettlementData).toHaveBeenCalledWith('tenant-a');
    expect(segment(el, '30 days')?.getAttribute('aria-checked')).toBe('true');
    const [raised, donors, average, running] = kpiTexts(el);
    expect(raised).toContain('GH₵ 400');
    expect(raised).toContain('vs previous 30 days');
    expect(donors).toContain('2');
    expect(average).toContain('Median GH₵ 200');
    expect(running).toContain('1 active · 1 paused');
  });

  it('draws the four charts with a table view each', async () => {
    const { el } = await render();

    expect(cardTitles(el)).toEqual(
      expect.arrayContaining([
        'Raised over time',
        'By donation type',
        'Top events by raised',
        'Team performance',
      ]),
    );
    const kinds = backend.charts.created.map((chart) => chart.createdWith.type);
    expect(kinds).toEqual(expect.arrayContaining(['line', 'doughnut', 'bar']));
    const chartLabels = backend.charts.created.flatMap(
      (chart) => (chart.data?.labels ?? []) as string[],
    );
    expect(chartLabels).toContain('Yaw Boateng');
  });

  it('lists the newest donations with links to their events, and the upcoming events', async () => {
    const { el } = await render();

    const feed = Array.from(el.querySelectorAll('app-donation-feed .feed-row'));
    expect(feed.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Kofi Mensah'),
      expect.stringContaining('Ama Owusu'),
    ]);
    expect(feed[0].querySelector('a')?.getAttribute('href')).toBe('/company/events/e2');
    const upcoming = el.querySelectorAll('app-upcoming-events .feed-row a');
    expect(Array.from(upcoming).map((a) => a.textContent?.trim())).toEqual([
      'Mensah Wedding',
      'Odoi Funeral',
    ]);
  });

  it('re-slices the same read and remembers the choice when the period changes', async () => {
    const { fixture, el } = await render();

    segment(el, 'All time')?.click();
    await settle(fixture);

    expect(kpiTexts(el)[0]).toContain('GH₵ 600');
    expect(kpiTexts(el)[0]).not.toContain('vs previous');
    expect(backend.loadTenantSettlementData).toHaveBeenCalledOnce();
    expect(localStorage.getItem(PERIOD_KEY)).toBe('all');
  });

  it('opens on the period remembered for this user', async () => {
    localStorage.setItem(PERIOD_KEY, 'today');

    const { el } = await render();

    expect(segment(el, 'Today')?.getAttribute('aria-checked')).toBe('true');
    expect(kpiTexts(el)[0]).toContain('GH₵ 400');
    expect(kpiTexts(el)[0]).toContain('New');
  });

  it('shows the first-run call to action when the company has no events', async () => {
    backend.listTenantEvents.mockResolvedValue([]);
    backend.loadTenantSettlementData.mockResolvedValue({ events: [], donations: [] });

    const { el } = await render();

    const action = el.querySelector<HTMLAnchorElement>('.first-run a');
    expect(action?.textContent?.trim()).toBe('Create your first event');
    expect(action?.getAttribute('href')).toBe('/company/events');
    expect(el.querySelector('.total-value')?.textContent?.trim()).toBe('GH₵ 0.00');
    expect(el.querySelector('app-company-kpis')).toBeNull();
    expect(el.querySelector('app-period-filter')).toBeNull();
  });

  it('marks every insight as unavailable when the read fails, then retries', async () => {
    backend.loadTenantSettlementData.mockRejectedValueOnce(new ServiceError('offline'));
    const { fixture, el } = await render();

    expect(el.querySelectorAll('app-chart-card [role="alert"]')).toHaveLength(6);
    expect(kpiTexts(el)[0]).toContain("Couldn't load");

    el.querySelector<HTMLButtonElement>('app-chart-card [role="alert"] button')?.click();
    await settle(fixture);

    expect(el.querySelectorAll('app-chart-card [role="alert"]')).toHaveLength(0);
    expect(kpiTexts(el)[0]).toContain('GH₵ 400');
  });

  it('says when the period has no donations instead of drawing empty charts', async () => {
    backend.loadTenantSettlementData.mockResolvedValue({ events, donations: [] });

    const { el } = await render();

    expect(el.textContent).toContain('No donations in this period.');
    expect(kpiTexts(el)[0]).toContain('GH₵ 0');
  });

  it('refreshes the insights after a donation push', async () => {
    const { fixture } = await render();
    const store = fixture.debugElement.injector.get(CompanyInsightsStore);
    const refreshSoon = vi.spyOn(store, 'refreshSoon');

    backend.listeners?.onDonationChanged('e1');
    await settle(fixture);

    expect(refreshSoon).toHaveBeenCalledOnce();
  });
});
