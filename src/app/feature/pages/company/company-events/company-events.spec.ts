import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CompanyEvents } from './company-events';
import { OrganizerEventDataService } from '../../../../data/services/organizer-event-data.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import { ServiceError } from '../../../../core/services/service-error';
import type { Event } from '../../../../data/models/event';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'e1',
    name: 'Odoi Funeral',
    type: 'funeral',
    date: '2026-11-02T00:00:00.000+00:00',
    hostName: 'The Odoi Family',
    status: 'active',
    tenantId: 'tenant-a',
    assignedUserIds: [],
    createdBy: 'so-a',
    nextReceiptSeq: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CompanyEvents', () => {
  let eventData: Record<string, ReturnType<typeof vi.fn>>;

  async function render(events: Event[] | Error) {
    if (events instanceof Error) eventData['listTenantEvents'].mockRejectedValue(events);
    else eventData['listTenantEvents'].mockResolvedValue(events);
    TestBed.configureTestingModule({
      imports: [CompanyEvents],
      providers: [
        provideRouter([]),
        { provide: OrganizerEventDataService, useValue: eventData },
        { provide: TeamDataService, useValue: { listTeamMembers: vi.fn().mockResolvedValue([]) } },
        {
          provide: TenantService,
          useValue: { context: signal({ membership: { tenantId: 'tenant-a' } }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(CompanyEvents);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const button = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

  beforeEach(() => {
    eventData = {
      listTenantEvents: vi.fn(),
      createEvent: vi.fn(),
      updateEvent: vi.fn(),
      setEventStatus: vi.fn(),
      assignOperators: vi.fn(),
      regenerateAccessCode: vi.fn(),
    };
  });

  it("lists the caller's own tenant's Events", async () => {
    const { el } = await render([makeEvent(), makeEvent({ id: 'e2', name: 'Mensah Wedding' })]);

    expect(eventData['listTenantEvents']).toHaveBeenCalledWith('tenant-a');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.textContent).toContain('Mensah Wedding');
  });

  it("links each Event's name to its detail page", async () => {
    const { el } = await render([makeEvent({ id: 'e7', name: 'Mensah Wedding' })]);

    const link = el.querySelector<HTMLAnchorElement>('tbody a');
    expect(link?.textContent?.trim()).toBe('Mensah Wedding');
    expect(link?.getAttribute('href')).toBe('/company/events/e7');
  });

  it('shows the empty state with a create action', async () => {
    const { el } = await render([]);

    expect(el.textContent).toContain("You haven't created an Event yet");
    expect(button(el, 'Create event')).toBeTruthy();
  });

  it('shows a retryable error when the list fails', async () => {
    const { el } = await render(new ServiceError("We couldn't load your events"));

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      "We couldn't load your events",
    );
    expect(button(el, 'Try again')).toBeTruthy();
  });

  it('creates an Event from the dialog and adds it to the list', async () => {
    eventData['createEvent'].mockResolvedValue(makeEvent({ id: 'new', name: 'New Service' }));
    const { fixture, el } = await render([]);

    button(el, 'Create event')!.click();
    await settle(fixture);
    const dialog = el.querySelector('form[role="dialog"]') as HTMLFormElement;
    fill(dialog, '#evName', 'New Service');
    fill(dialog, '#evDate', '2026-11-02');
    fill(dialog, '#evHost', 'The Family');
    dialog.dispatchEvent(new globalThis.Event('submit'));
    await settle(fixture);

    expect(eventData['createEvent']).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Service', type: 'funeral', venue: null }),
    );
    expect(el.querySelector('form[role="dialog"]')).toBeNull();
    expect(el.textContent).toContain('New Service');
  });

  it('keeps the dialog open with the error when creation is refused', async () => {
    eventData['createEvent'].mockRejectedValue(new ServiceError('Forbidden'));
    const { fixture, el } = await render([]);

    button(el, 'Create event')!.click();
    await settle(fixture);
    const dialog = el.querySelector('form[role="dialog"]') as HTMLFormElement;
    fill(dialog, '#evName', 'New Service');
    fill(dialog, '#evDate', '2026-11-02');
    fill(dialog, '#evHost', 'The Family');
    dialog.dispatchEvent(new globalThis.Event('submit'));
    await settle(fixture);

    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Forbidden');
  });

  it('does not offer Edit on a closed Event', async () => {
    const { el } = await render([makeEvent({ status: 'closed' })]);

    expect(button(el, 'Edit')).toBeUndefined();
    expect(button(el, 'Manage')).toBeTruthy();
  });

  it('changes status from the manage dialog with the server’s answer', async () => {
    eventData['setEventStatus'].mockResolvedValue(makeEvent({ status: 'paused' }));
    const { fixture, el } = await render([makeEvent()]);

    button(el, 'Manage')!.click();
    await settle(fixture);
    expect(button(el, 'Reopen')).toBeUndefined();
    button(el, 'Pause')!.click();
    await settle(fixture);

    expect(eventData['setEventStatus']).toHaveBeenCalledWith('e1', 'paused');
    expect(button(el, 'Resume')).toBeTruthy();
    expect(el.querySelector('tbody .tag')?.textContent).toContain('Paused');
  });

  it('regenerates the family code from the manage dialog', async () => {
    eventData['regenerateAccessCode'].mockResolvedValue('NEWCODE2');
    const { fixture, el } = await render([makeEvent({ accessCode: 'OLDCODE2' })]);

    button(el, 'Manage')!.click();
    await settle(fixture);
    button(el, 'Regenerate code')!.click();
    await settle(fixture);

    expect(el.textContent).toContain('NEWCODE2');
    expect(el.textContent).toContain('the old one no longer works');
  });
});

function fill(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new globalThis.Event('input'));
}
