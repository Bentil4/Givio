import { TestBed } from '@angular/core/testing';
import { makeDonation } from '../../../../data/models/donation-test-fixtures';
import { createFakeCharts, type FakeCharts } from '../../../../../testing/fake-chart';
import { OperatorCharts, formatGifts } from './operator-charts';
import type { OperatorInsightSource } from './operator-insights.util';

const SOURCE: OperatorInsightSource = {
  donations: [
    makeDonation({ id: 'a', recordedAt: '2026-10-07T09:00:00Z' }),
    makeDonation({
      id: 'b',
      amountMinor: null,
      donationType: 'in_kind',
      recordedAt: '2026-10-07T10:00:00Z',
    }),
  ],
  period: 'today',
  now: new Date('2026-10-07T10:30:00Z'),
};

describe('OperatorCharts', () => {
  let charts: FakeCharts;

  beforeEach(() => {
    charts = createFakeCharts();
    TestBed.configureTestingModule({ providers: [charts.provider] });
  });

  async function render(state: string) {
    const fixture = TestBed.createComponent(OperatorCharts);
    fixture.componentRef.setInput('source', SOURCE);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('emptyText', 'No donations yet today');
    await fixture.whenStable();
    return fixture;
  }

  it("draws today's pace and the split by type, each with a summary", async () => {
    const fixture = await render('ready');
    const el = fixture.nativeElement as HTMLElement;
    const summaries = [...el.querySelectorAll('[role="img"]')].map((f) =>
      f.getAttribute('aria-label'),
    );

    expect(el.textContent).toContain("Today's pace");
    expect(summaries[0]).toContain("Today's pace");
    expect(summaries[1]).toContain('In-Kind 1 gift');
    expect(charts.created.map((c) => c.createdWith.type)).toEqual(['bar', 'doughnut']);
  });

  it('shows the empty text in both cards when nothing is recorded', async () => {
    const el = (await render('empty')).nativeElement as HTMLElement;

    expect(el.querySelectorAll('.panel-empty')).toHaveLength(2);
    expect(el.textContent).toContain('No donations yet today');
  });

  it('offers a retry when the donations could not be loaded', async () => {
    const fixture = await render('error');
    const retries = vi.fn();
    fixture.componentInstance.retry.subscribe(retries);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.btn')!.click();

    expect(retries).toHaveBeenCalledTimes(1);
  });

  it('counts gifts in words', () => {
    expect(formatGifts(1)).toBe('1 gift');
    expect(formatGifts(1200)).toBe('1,200 gifts');
  });
});
