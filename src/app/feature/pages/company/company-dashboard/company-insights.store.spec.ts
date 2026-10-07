import { TestBed } from '@angular/core/testing';
import { makeDonation } from '../../../../data/models/donation-test-fixtures';
import { makeEvent } from '../../../../data/services/donation-data-test-fixtures';
import { CompanyInsightsStore } from './company-insights.store';
import {
  DASHBOARD_USER_ID,
  setUpCompanyDashboard,
  type DashboardBackend,
} from './company-dashboard-test-fixtures';

const NOW = new Date('2026-10-07T12:00:00.000Z');

const data = {
  events: [makeEvent()],
  donations: [
    makeDonation({ id: 'now', amountMinor: 30000, recordedAt: '2026-10-07T09:00:00Z' }),
    makeDonation({ id: 'before', amountMinor: 10000, recordedAt: '2026-10-06T09:00:00Z' }),
  ],
};

describe('CompanyInsightsStore', () => {
  let backend: DashboardBackend;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    backend = setUpCompanyDashboard();
    backend.loadTenantSettlementData.mockResolvedValue(data);
    TestBed.configureTestingModule({ providers: [CompanyInsightsStore] });
  });

  afterEach(() => vi.useRealTimers());

  async function loadedStore() {
    const store = TestBed.inject(CompanyInsightsStore);
    await store.load();
    return store;
  }

  it('compares the chosen period with the equal period before it', async () => {
    const store = await loadedStore();

    store.choosePeriod('today');

    expect(store.insights()?.current.map((d) => d.id)).toEqual(['now']);
    expect(store.insights()?.previous.map((d) => d.id)).toEqual(['before']);
    expect(store.kpis()?.raised.delta).toEqual({
      direction: 'up',
      percent: 200,
      comparisonLabel: 'vs same time yesterday',
    });
  });

  it("remembers the period under the signed-in user's key", async () => {
    const store = await loadedStore();

    store.choosePeriod('90d');

    expect(localStorage.getItem(`givio:dashboard-period:company:${DASHBOARD_USER_ID}`)).toBe('90d');
  });

  it('reports an error, with no figures, when the read fails', async () => {
    backend.loadTenantSettlementData.mockRejectedValue(new Error('offline'));

    const store = await loadedStore();

    expect(store.status()).toBe('error');
    expect(store.kpis()).toBeNull();
  });

  it('re-reads once after a burst of pushes and keeps the last read if that fails', async () => {
    const store = await loadedStore();
    backend.loadTenantSettlementData.mockClear().mockRejectedValue(new Error('offline'));

    store.refreshSoon();
    store.refreshSoon();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(backend.loadTenantSettlementData).toHaveBeenCalledOnce();
    expect(store.status()).toBe('ready');
    expect(store.insights()?.current).toHaveLength(2);
  });

  it('flags missing recorder names rather than failing the dashboard', async () => {
    backend.listTeamMembersIncludingRevoked.mockRejectedValue(new Error('offline'));

    const store = await loadedStore();

    expect(store.recorderNamesMissing()).toBe(true);
    expect(store.status()).toBe('ready');
  });
});
