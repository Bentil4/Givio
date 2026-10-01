import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { CompanyDashboard } from './company-dashboard';
import { OrganizerEventDataService } from '../../../../data/services/organizer-event-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import {
  TenantTotalsDataService,
  type EventFigures,
  type TenantChangeListeners,
} from '../../../../data/services/tenant-totals-data.service';
import { ServiceError } from '../../../../core/services/service-error';
import { makeEvent } from '../../../../data/services/donation-data-test-fixtures';
import type { Event } from '../../../../data/models/event';

const figures = (totalMinor: number, donorCount = 1): EventFigures => ({ totalMinor, donorCount });

describe('CompanyDashboard', () => {
  let listTenantEvents: ReturnType<typeof vi.fn>;
  let loadEventFigures: ReturnType<typeof vi.fn>;
  let stopListening: ReturnType<typeof vi.fn>;
  let listeners: TenantChangeListeners | null;

  beforeEach(() => {
    listTenantEvents = vi.fn();
    loadEventFigures = vi.fn();
    stopListening = vi.fn();
    listeners = null;
    TestBed.configureTestingModule({
      imports: [CompanyDashboard],
      providers: [
        provideRouter([]),
        { provide: OrganizerEventDataService, useValue: { listTenantEvents } },
        {
          provide: TenantService,
          useValue: {
            tenant: signal({ name: 'Odoi Services' }),
            context: signal({ membership: { tenantId: 'tenant-a' } }),
          },
        },
        {
          provide: TenantTotalsDataService,
          useValue: {
            loadEventFigures,
            subscribeToTenantChanges: vi.fn(async (given: TenantChangeListeners) => {
              listeners = given;
              return stopListening;
            }),
          },
        },
      ],
    });
  });

  async function render(events: Event[] | Error) {
    if (events instanceof Error) listTenantEvents.mockRejectedValue(events);
    else listTenantEvents.mockResolvedValue(events);
    const fixture = TestBed.createComponent(CompanyDashboard);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: ComponentFixture<unknown>) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  const totalText = (el: HTMLElement) => el.querySelector('.total-value')?.textContent?.trim();
  const rowTexts = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.event-row')).map((row) => row.textContent ?? '');

  it('shows the skeleton, announced as loading, before the figures arrive', () => {
    listTenantEvents.mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(CompanyDashboard);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('app-skeleton-rows')).toHaveLength(2);
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      'Loading your company total',
    );
    expect(el.querySelector('.total-value')).toBeNull();
  });

  it('sums every running Event and lists each with its own total and donors', async () => {
    loadEventFigures.mockImplementation(async (id: string) =>
      id === 'e1' ? figures(50000, 3) : figures(2550, 1),
    );

    const { el } = await render([
      makeEvent({ id: 'e1', name: 'Odoi Funeral' }),
      makeEvent({ id: 'e2', name: 'Mensah Wedding', status: 'paused' }),
      makeEvent({ id: 'e3', name: 'Old Event', status: 'closed' }),
    ]);

    expect(listTenantEvents).toHaveBeenCalledWith('tenant-a');
    expect(totalText(el)).toBe('GH₵ 525.50');
    expect(loadEventFigures).not.toHaveBeenCalledWith('e3');
    expect(rowTexts(el)).toHaveLength(2);
    expect(rowTexts(el)[0]).toContain('GH₵ 500.00');
    expect(rowTexts(el)[0]).toContain('3 donors');
    expect(rowTexts(el)[1]).toContain('Paused');
    expect(el.textContent).toContain('(1 active, 1 paused)');
  });

  it('is a real GH₵ 0.00 for a company with no Events yet', async () => {
    const { el } = await render([]);

    expect(totalText(el)).toBe('GH₵ 0.00');
    expect(el.textContent).toContain('No running events yet');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the total and marks it partial when one Event fails to load', async () => {
    loadEventFigures.mockImplementation(async (id: string) => {
      if (id === 'e2') throw new ServiceError("We couldn't load this event's total");
      return figures(50000);
    });

    const { el } = await render([makeEvent({ id: 'e1' }), makeEvent({ id: 'e2', name: 'Broken' })]);

    expect(totalText(el)).toContain('GH₵ 500.00');
    expect(totalText(el)).toContain('Partial');
    expect(el.textContent).toContain("Doesn't include 1 event that couldn't load");
    expect(rowTexts(el)[1]).toContain("Couldn't load");
  });

  it('retries just the failed Event', async () => {
    loadEventFigures.mockRejectedValueOnce(new Error('x')).mockResolvedValue(figures(700));
    const { fixture, el } = await render([makeEvent({ id: 'e1' })]);

    el.querySelector<HTMLButtonElement>('.event-row button')?.click();
    await settle(fixture);

    expect(loadEventFigures).toHaveBeenLastCalledWith('e1');
    expect(totalText(el)).toBe('GH₵ 7.00');
  });

  it('refetches only the affected Event when a donation is pushed', async () => {
    loadEventFigures.mockResolvedValue(figures(1000));
    const { fixture, el } = await render([makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })]);
    loadEventFigures.mockClear().mockResolvedValue(figures(6000));

    listeners?.onDonationChanged('e2');
    await settle(fixture);

    expect(loadEventFigures).toHaveBeenCalledTimes(1);
    expect(loadEventFigures).toHaveBeenCalledWith('e2');
    expect(listTenantEvents).toHaveBeenCalledTimes(1);
    expect(totalText(el)).toBe('GH₵ 70.00');
  });

  it('keeps only the newest of two overlapping refetches', async () => {
    loadEventFigures.mockResolvedValue(figures(1000));
    const { fixture, el } = await render([makeEvent({ id: 'e1' })]);
    let resolveSlow: (value: EventFigures) => void = () => undefined;
    loadEventFigures
      .mockReturnValueOnce(new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce(figures(3000));

    listeners?.onDonationChanged('e1');
    listeners?.onDonationChanged('e1');
    await settle(fixture);
    resolveSlow(figures(2000));
    await settle(fixture);

    expect(totalText(el)).toBe('GH₵ 30.00');
  });

  it('re-reads the Event list when a donation arrives for an Event it has not seen', async () => {
    loadEventFigures.mockResolvedValue(figures(1000));
    const { fixture, el } = await render([makeEvent({ id: 'e1' })]);
    listTenantEvents.mockResolvedValue([makeEvent({ id: 'e1' }), makeEvent({ id: 'new' })]);
    loadEventFigures.mockClear();

    listeners?.onDonationChanged('new');
    await settle(fixture);

    expect(loadEventFigures).toHaveBeenCalledTimes(1);
    expect(loadEventFigures).toHaveBeenCalledWith('new');
    expect(totalText(el)).toBe('GH₵ 20.00');
  });

  it('ignores donation pushes for a closed Event', async () => {
    loadEventFigures.mockResolvedValue(figures(1000));
    const { fixture } = await render([makeEvent({ id: 'old', status: 'closed' })]);

    listeners?.onDonationChanged('old');
    await settle(fixture);

    expect(loadEventFigures).not.toHaveBeenCalled();
    expect(listTenantEvents).toHaveBeenCalledTimes(1);
  });

  it('patches an Event push in place and drops a newly closed Event from the total', async () => {
    loadEventFigures.mockResolvedValue(figures(1000));
    const { fixture, el } = await render([makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })]);

    listeners?.onEventChanged({ id: 'e2', name: 'Renamed', status: 'closed' });
    listeners?.onEventChanged({ id: 'e1', name: 'Renamed', status: 'active' });
    await settle(fixture);

    expect(totalText(el)).toBe('GH₵ 10.00');
    expect(rowTexts(el)[0]).toContain('Renamed');
    expect(listTenantEvents).toHaveBeenCalledTimes(1);
  });

  it('loads figures for a reopened Event', async () => {
    loadEventFigures.mockResolvedValue(figures(1000));
    const { fixture, el } = await render([makeEvent({ id: 'e1', status: 'closed' })]);

    listeners?.onEventChanged({ id: 'e1', name: 'Back', status: 'active' });
    await settle(fixture);

    expect(loadEventFigures).toHaveBeenCalledWith('e1');
    expect(totalText(el)).toBe('GH₵ 10.00');
  });

  it('shows a retryable error when the Event list itself fails', async () => {
    const { el } = await render(new ServiceError("We couldn't load your events"));

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      "We couldn't load your events",
    );
    expect(listeners).toBeNull();
  });

  it('closes the Realtime subscription when the page is destroyed', async () => {
    const { fixture } = await render([]);

    fixture.destroy();

    expect(stopListening).toHaveBeenCalled();
  });
});
