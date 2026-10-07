import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ServiceError } from '../../../../core/services/service-error';
import type { MembershipRole } from '../../../../data/models/membership';
import type { TenantConflict } from '../../../../data/models/donation';
import { makeDonation } from '../../../../data/models/donation-test-fixtures';
import { CompanyDonations } from './company-donations';
import {
  COMPANY_DONATIONS,
  buttonNamed,
  createCompanyDonationsBackend,
  makeCompanyEvent,
  provideCompanyDonationsBackend,
  settle,
  type CompanyDonationsBackend,
} from './company-donations-test-fixtures';

describe('CompanyDonations', () => {
  let backend: CompanyDonationsBackend;

  beforeEach(() => {
    backend = createCompanyDonationsBackend();
    backend.listTenantEvents.mockResolvedValue([
      makeCompanyEvent(),
      makeCompanyEvent({ id: 'e2', name: 'Mensah Wedding', type: 'wedding' }),
    ]);
    backend.listDonationsForEvents.mockResolvedValue([
      ...COMPANY_DONATIONS,
      makeDonation({ id: 'd4', eventId: 'e2', receiptNumber: 'WED-0001', donorName: 'Esi Ofori' }),
    ]);
  });

  async function render(role: MembershipRole) {
    TestBed.configureTestingModule({
      imports: [CompanyDonations],
      providers: [provideRouter([]), ...provideCompanyDonationsBackend(backend, role)],
    });
    const fixture = TestBed.createComponent(CompanyDonations);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const tabs = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[role="tab"]')).map((t) => t.textContent?.trim());
  const listed = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('app-donation-list li')).map((li) => li.textContent ?? '');

  async function openTab(fixture: Parameters<typeof settle>[0], el: HTMLElement, name: string) {
    Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((t) => t.textContent?.includes(name))!
      .click();
    await settle(fixture);
  }

  function typeInto(el: HTMLElement, selector: string, value: string) {
    const field = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  it("reads every company Event's donations and filters them by event", async () => {
    const { fixture, el } = await render('organizer');

    expect(backend.listDonationsForEvents).toHaveBeenCalledWith(['e1', 'e2']);
    expect(listed(el)).toHaveLength(3);

    const event = el.querySelector<HTMLSelectElement>('#donationEvent')!;
    event.value = 'e2';
    event.dispatchEvent(new Event('change'));
    await settle(fixture);

    expect(listed(el)).toEqual([expect.stringContaining('Esi Ofori')]);
  });

  it('gives a co-Organizer All and Deleted, with no actions anywhere', async () => {
    const { fixture, el } = await render('organizer');

    expect(tabs(el)).toEqual(['All', 'Deleted']);
    expect(buttonNamed(el, 'Correct')).toBeUndefined();
    await openTab(fixture, el, 'Deleted');
    expect(el.querySelector('tbody')?.textContent).toContain('Duplicate of FUN-0001');
    expect(buttonNamed(el, 'Restore')).toBeUndefined();
  });

  it('gives the Super Organizer the Sync conflicts tab too', async () => {
    const { el } = await render('super_organizer');

    expect(tabs(el)).toEqual(['All', 'Deleted', 'Sync conflicts']);
    expect(el.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('All');
  });

  it('moves between tabs with the arrow keys', async () => {
    const { fixture, el } = await render('super_organizer');

    const first = el.querySelector<HTMLButtonElement>('[role="tab"]')!;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await settle(fixture);

    expect(document.activeElement?.textContent).toContain('Sync conflicts');
    expect(el.querySelector('[role="tabpanel"]')?.id).toBe('donations-panel-conflicts');
  });

  it('lets the Super Organizer remove a donation, but only with a reason', async () => {
    backend.softDeleteDonation.mockResolvedValue({
      ...COMPANY_DONATIONS[0],
      deletedAt: '2026-10-12T00:00:00.000Z',
      deletionReason: 'Recorded twice by mistake',
    });
    const { fixture, el } = await render('super_organizer');

    buttonNamed(el, 'Remove')!.click();
    await settle(fixture);
    const dialog = el.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('Remove FUN-0001?');
    buttonNamed(el, 'Remove donation')!.click();
    await settle(fixture);
    expect(backend.softDeleteDonation).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('removeDonationReason');

    typeInto(el, '#removeDonationReason', '  Recorded twice by mistake ');
    buttonNamed(el, 'Remove donation')!.click();
    await settle(fixture);

    expect(backend.softDeleteDonation).toHaveBeenCalledWith('d1', 'Recorded twice by mistake');
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    expect(listed(el).some((row) => row.includes('Ama Owusu'))).toBe(false);
  });

  it('lets the Super Organizer correct a donation with a reason', async () => {
    backend.editDonation.mockResolvedValue({ ...COMPANY_DONATIONS[0], amountMinor: 75000 });
    const { fixture, el } = await render('super_organizer');

    buttonNamed(el, 'Correct')!.click();
    await settle(fixture);
    typeInto(el, '#editDonationAmount', '750');
    typeInto(el, '#editDonationReason', 'Donor confirmed GH₵ 750 by phone');
    buttonNamed(el, 'Save correction')!.click();
    await settle(fixture);

    expect(backend.editDonation).toHaveBeenCalledWith(
      'd1',
      { donorName: 'Ama Owusu', amountMinor: 75000, donationType: 'cash', onBehalfOf: null },
      'Donor confirmed GH₵ 750 by phone',
    );
    expect(listed(el)[0]).toContain('GH₵ 750.00');
  });

  it("keeps the dialog open with the server's refusal", async () => {
    backend.editDonation.mockRejectedValue(new ServiceError('Cannot edit a deleted donation'));
    const { fixture, el } = await render('super_organizer');

    buttonNamed(el, 'Correct')!.click();
    await settle(fixture);
    typeInto(el, '#editDonationReason', 'Donor confirmed the amount');
    buttonNamed(el, 'Save correction')!.click();
    await settle(fixture);

    expect(el.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      'Cannot edit a deleted donation',
    );
  });

  it('lets the Super Organizer restore a removed donation', async () => {
    backend.restoreDonation.mockResolvedValue({ ...COMPANY_DONATIONS[2], deletedAt: null });
    const { fixture, el } = await render('super_organizer');

    await openTab(fixture, el, 'Deleted');
    buttonNamed(el, 'Restore')!.click();
    await settle(fixture);
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'Duplicate of FUN-0001',
    );
    buttonNamed(el, 'Restore donation')!.click();
    await settle(fixture);

    expect(backend.restoreDonation).toHaveBeenCalledWith('d3');
    expect(el.textContent).toContain('Nothing has been removed');
  });

  it('resolves a sync conflict and refreshes the donations', async () => {
    const conflict: TenantConflict = {
      conflictId: 'c1',
      eventId: 'e1',
      receiptNumber: 'FUN-0001',
      local: { ...COMPANY_DONATIONS[0], amountMinor: 70000 },
      server: COMPANY_DONATIONS[0],
      detectedAt: '2026-10-10T11:00:00.000Z',
    };
    backend.listConflicts.mockResolvedValue([conflict]);
    const { fixture, el } = await render('super_organizer');

    await openTab(fixture, el, 'Sync conflicts');
    expect(el.querySelector('app-conflict-resolver')?.textContent).toContain('Kwesi Boateng');
    buttonNamed(el, 'Keep the server version')!.click();
    await settle(fixture);

    expect(backend.resolveConflict).toHaveBeenCalledWith('c1', 'keep-server');
    expect(backend.listDonationsForEvents).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('Nothing to resolve');
  });
});
