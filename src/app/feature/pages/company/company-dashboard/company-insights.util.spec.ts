import { makeDonation } from '../../../../data/models/donation-test-fixtures';
import type { Event } from '../../../../data/models/event';
import {
  companyInsights,
  companyKpis,
  latestDonations,
  upcomingEvents,
} from './company-insights.util';

const NOW = new Date('2026-10-07T12:00:00.000Z');

const event = (overrides: Partial<Event>): Event => ({
  id: 'e1',
  name: 'Odoi Funeral',
  type: 'funeral',
  date: '2026-10-20',
  hostName: 'The Odoi Family',
  status: 'active',
  assignedUserIds: [],
  createdBy: 'so-1',
  nextReceiptSeq: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const donations = [
  makeDonation({ id: 'today', amountMinor: 30000, recordedAt: '2026-10-07T09:00:00.000Z' }),
  makeDonation({ id: 'week', amountMinor: 10000, recordedAt: '2026-10-03T09:00:00.000Z' }),
  makeDonation({ id: 'prev', amountMinor: 20000, recordedAt: '2026-09-28T09:00:00.000Z' }),
  makeDonation({ id: 'old', amountMinor: 70000, recordedAt: '2026-06-01T09:00:00.000Z' }),
  makeDonation({
    id: 'gone',
    amountMinor: 99900,
    recordedAt: '2026-10-07T10:00:00.000Z',
    deletedAt: '2026-10-07T11:00:00.000Z',
  }),
];

const data = { events: [event({})], donations };

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe('company insights', () => {
  it('splits counted donations into the period and the equal period before it', () => {
    const insights = companyInsights(data, '7d', NOW);

    expect(ids(insights.current)).toEqual(['today', 'week']);
    expect(ids(insights.previous)).toEqual(['prev']);
    expect(insights.window.buckets).toHaveLength(7);
  });

  it('re-slices the same read when the period changes', () => {
    expect(ids(companyInsights(data, 'today', NOW).current)).toEqual(['today']);
    expect(ids(companyInsights(data, '30d', NOW).current)).toEqual(['today', 'week', 'prev']);
  });

  it('starts All time at the earliest counted donation and compares with nothing', () => {
    const insights = companyInsights(data, 'all', NOW);

    expect(ids(insights.current)).toEqual(['today', 'week', 'prev', 'old']);
    expect(insights.window.range.start).toBe('2026-06-01T00:00:00.000Z');
    expect(insights.window.previous).toBeNull();
    expect(insights.previous).toEqual([]);
  });

  it('gives each KPI its change against the previous period', () => {
    const kpis = companyKpis(companyInsights(data, '7d', NOW));

    expect(kpis.raised.value).toBe('GH₵ 400');
    expect(kpis.raised.delta).toEqual({
      direction: 'up',
      percent: 100,
      comparisonLabel: 'vs previous 7 days',
    });
    expect(kpis.raised.sparkline).toHaveLength(7);
    expect(kpis.donors.value).toBe('2');
    expect(kpis.donors.delta?.percent).toBe(100);
    expect(kpis.averageGift.value).toBe('GH₵ 200');
    expect(kpis.averageGift.delta?.direction).toBe('flat');
    expect(kpis.averageGift.hint).toBe('Median GH₵ 200');
  });

  it('shows no change for All time', () => {
    const kpis = companyKpis(companyInsights(data, 'all', NOW));

    expect(kpis.raised.delta).toBeNull();
    expect(kpis.donors.delta).toBeNull();
  });

  it('has no average gift when the period holds only in-kind gifts', () => {
    const inKind = [makeDonation({ amountMinor: null, donationType: 'in_kind' })];
    const kpis = companyKpis(
      companyInsights({ events: [], donations: inKind }, 'all', new Date(inKind[0].recordedAt)),
    );

    expect(kpis.averageGift).toEqual({
      value: '—',
      delta: null,
      hint: 'No cash or mobile money gifts yet',
    });
  });

  it('counts running events, active and paused, but not closed ones', () => {
    const events = [
      event({ id: 'a' }),
      event({ id: 'b', status: 'paused' }),
      event({ id: 'c', status: 'closed' }),
    ];

    const kpis = companyKpis(companyInsights({ events, donations: [] }, '30d', NOW));

    expect(kpis.runningEvents.value).toBe('2');
    expect(kpis.runningEvents.hint).toBe('1 active · 1 paused');
  });

  it('lists the newest donations first, up to the count', () => {
    expect(ids(latestDonations(donations, 2))).toEqual(['gone', 'today']);
  });

  it('lists running events from today onwards, soonest first', () => {
    const events = [
      event({ id: 'later', date: '2026-11-01' }),
      event({ id: 'today', date: '2026-10-07' }),
      event({ id: 'past', date: '2026-10-06' }),
      event({ id: 'closed', date: '2026-10-08', status: 'closed' }),
      event({ id: 'soon', date: '2026-10-09' }),
    ];

    expect(ids(upcomingEvents(events, NOW, 2))).toEqual(['today', 'soon']);
  });
});
