import { TestBed } from '@angular/core/testing';
import { createFakeCharts, type FakeCharts } from '../../../../../testing/fake-chart';
import { SignupsApprovalsChart } from './signups-approvals-chart';

describe('SignupsApprovalsChart', () => {
  let charts: FakeCharts;

  async function render(counts: { signups: number[]; approvals: number[] }) {
    charts = createFakeCharts();
    TestBed.configureTestingModule({ providers: [charts.provider] });
    const fixture = TestBed.createComponent(SignupsApprovalsChart);
    fixture.componentRef.setInput('state', 'ready');
    fixture.componentRef.setInput('labels', ['5 Oct', '6 Oct', '7 Oct']);
    fixture.componentRef.setInput('counts', counts);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws signups and approvals as two named bar series on one count axis', async () => {
    const el = await render({ signups: [2, 0, 1], approvals: [0, 1, 1] });

    const config = charts.created[0].createdWith;
    expect(config.type).toBe('bar');
    expect(config.data.datasets.map((d) => d.label)).toEqual(['Signups', 'Approvals']);
    expect(el.querySelector('.chart-legend')?.textContent).toContain('Approvals');
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Signups and approvals, 5 Oct to 7 Oct: 3 signups, 2 approvals.',
    );
  });

  it('says so when nothing happened in the period', async () => {
    const el = await render({ signups: [0, 0, 0], approvals: [0, 0, 0] });

    expect(el.textContent).toContain('No signups or approvals in this period.');
  });
});
