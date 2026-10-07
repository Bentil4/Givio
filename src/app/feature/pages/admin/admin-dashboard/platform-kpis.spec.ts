import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Tenant } from '../../../../data/models/tenant';
import { createFakeCharts } from '../../../../../testing/fake-chart';
import { PlatformKpis } from './platform-kpis';
import type { PeriodWindow } from './platform-kpis.util';

const WINDOW: PeriodWindow = {
  current: { start: '2026-10-05T00:00:00.000Z', end: '2026-10-12T00:00:00.000Z' },
  previous: { start: '2026-09-28T00:00:00.000Z', end: '2026-10-05T00:00:00.000Z' },
  comparisonLabel: 'vs previous 7 days',
};

const SLOW_APPROVAL = {
  createdAt: '2026-10-05T00:00:00Z',
  verifiedAt: '2026-10-09T12:00:00Z',
  status: 'approved',
  verificationDocumentId: 'doc',
} as Tenant;

describe('PlatformKpis', () => {
  async function render(inputs: Record<string, unknown> = {}): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideRouter([]), createFakeCharts().provider] });
    const fixture = TestBed.createComponent(PlatformKpis);
    const defaults = {
      tenants: [SLOW_APPROVAL],
      tenantsState: 'ready',
      window: WINDOW,
      pendingApprovals: { applications: 2, identityReviews: 1, duplicateEvents: 0 },
      pendingApprovalsState: 'ready',
      openSupportRequests: 4,
      supportState: 'ready',
    };
    for (const [name, value] of Object.entries({ ...defaults, ...inputs })) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const tile = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll('app-kpi-tile')]
      .find((t) => t.querySelector('.stat-label')?.textContent?.includes(label))
      ?.textContent?.replace(/\s+/g, ' ') ?? '';

  it('shows all five platform figures', async () => {
    const el = await render();

    expect(tile(el, 'Active companies')).toContain('1');
    expect(tile(el, 'New signups')).toContain('1');
    expect(tile(el, 'Pending approvals')).toContain('2 applications · 1 flagged addition');
    expect(tile(el, 'Open support requests')).toContain('4');
  });

  it('states an over-target turnaround with an icon and words, as a warning', async () => {
    const el = await render();

    const turnaround = tile(el, 'Approval turnaround');
    expect(turnaround).toContain('4.5 days');
    expect(turnaround).toContain('Over the 3-business-day target');
    expect(el.querySelector('.turnaround-status mat-icon')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(el.querySelector('.kpi-tile.is-warning')).not.toBeNull();
  });

  it('shows company figures as unavailable, never zero, when companies fail to load', async () => {
    const el = await render({ tenants: [], tenantsState: 'error' });

    expect(tile(el, 'Active companies')).toContain('—');
    expect(tile(el, 'Active companies')).toContain('Not available');
  });

  it('shows the support count as unavailable when it cannot be read', async () => {
    const el = await render({ openSupportRequests: null });

    expect(tile(el, 'Open support requests')).toContain('Not available');
  });
});
