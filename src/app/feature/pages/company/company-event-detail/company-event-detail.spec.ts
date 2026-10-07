import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ServiceError } from '../../../../core/services/service-error';
import type { MembershipRole } from '../../../../data/models/membership';
import { createFakeCharts, type FakeCharts } from '../../../../../testing/fake-chart';
import { CompanyEventDetail } from './company-event-detail';
import {
  buttonNamed,
  createCompanyDonationsBackend,
  provideCompanyDonationsBackend,
  settle,
  type CompanyDonationsBackend,
} from '../company-donations/company-donations-test-fixtures';

describe('CompanyEventDetail', () => {
  let backend: CompanyDonationsBackend;
  let charts: FakeCharts;

  beforeEach(() => {
    backend = createCompanyDonationsBackend();
    charts = createFakeCharts();
  });

  async function render(role: MembershipRole, eventId = 'e1') {
    TestBed.configureTestingModule({
      imports: [CompanyEventDetail],
      providers: [
        provideRouter([]),
        charts.provider,
        ...provideCompanyDonationsBackend(backend, role),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: eventId }) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(CompanyEventDetail);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll('app-donation-list li'));

  it('shows the event header, its total from live donations only, and the donor count', async () => {
    const { el } = await render('organizer');

    expect(backend.listDonationsForEvents).toHaveBeenCalledWith(['e1']);
    expect(el.querySelector('h1')?.textContent).toContain('Odoi Funeral');
    expect(el.querySelector('.event-facts')?.textContent).toContain('Funeral');
    expect(el.querySelector('.event-facts')?.textContent).toContain('Osu Presbyterian Church');
    expect(el.querySelector('.page-total-value')?.textContent).toContain('GH₵ 700.00');
    expect(el.querySelector('.page-head-total')?.textContent).toContain('2 donors');
  });

  it('breaks the total down by donation type, labelled beside the doughnut', async () => {
    const { el } = await render('organizer');

    const types = Array.from(el.querySelectorAll('app-chart-legend li')).map(
      (item) => item.textContent ?? '',
    );
    expect(types[0]).toContain('Cash');
    expect(types[0]).toContain('71%');
    expect(types[1]).toContain('Mobile Money');
    expect(charts.created[0].createdWith.type).toBe('doughnut');
  });

  it("lists each live donation with the donor's phone and the recorder's name, revoked or not", async () => {
    const { el } = await render('organizer');

    expect(rows(el)).toHaveLength(2);
    expect(rows(el)[0].textContent).toContain('+233201234567');
    expect(rows(el)[0].textContent).toContain('Kwesi Boateng');
    expect(rows(el)[1].textContent).toContain('Efua Mensah');
    expect(el.textContent).not.toContain('Kofi Asare');
  });

  it('gives a co-Organizer the data but no correction actions', async () => {
    const { el } = await render('organizer');

    expect(buttonNamed(el, 'Correct')).toBeUndefined();
    expect(buttonNamed(el, 'Remove')).toBeUndefined();
    expect(buttonNamed(el, 'Export to Excel')).toBeDefined();
  });

  it('gives the Super Organizer Correct and Remove on every donation', async () => {
    const { el } = await render('super_organizer');

    expect(el.querySelectorAll('app-donation-list li button')).toHaveLength(4);
    expect(buttonNamed(el, 'Correct')?.textContent).toContain('FUN-0001');
  });

  it('filters by search, type and recorder, announcing the count', async () => {
    const { fixture, el } = await render('organizer');

    buttonNamed(el, 'Mobile Money')?.click();
    await settle(fixture);

    expect(rows(el)).toHaveLength(1);
    expect(el.querySelector('.showing')?.textContent).toContain('Showing 1 donation');

    const search = el.querySelector<HTMLInputElement>('#donationSearch')!;
    search.value = 'ama';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(rows(el)).toHaveLength(0);
    buttonNamed(el, 'Clear filters')?.click();
    await settle(fixture);

    const recorder = el.querySelector<HTMLSelectElement>('#donationRecorder')!;
    recorder.value = 'op-gone';
    recorder.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(rows(el).map((r) => r.textContent)).toEqual([expect.stringContaining('Yaw Darko')]);
  });

  it('exports the full sheet with recorders named', async () => {
    const { el } = await render('organizer');

    buttonNamed(el, 'Export to Excel')?.click();

    const [eventName, donations, options] = backend.exportDonationsXlsx.mock.calls[0];
    expect(eventName).toBe('Odoi Funeral');
    expect(options).toBeUndefined();
    expect(donations.map((d: { recordedBy: string }) => d.recordedBy)).toEqual([
      'Kwesi Boateng',
      'Efua Mensah',
    ]);
  });

  it('says so when the event is not one of the company’s', async () => {
    const { el } = await render('organizer', 'other-tenant-event');

    expect(el.querySelector('h1')?.textContent).toContain("couldn't find this event");
    expect(el.querySelector('a[href="/company/events"]')).not.toBeNull();
  });

  it('offers a retry when loading fails', async () => {
    backend.listTenantEvents.mockRejectedValueOnce(
      new ServiceError("We couldn't load your events"),
    );
    const { fixture, el } = await render('organizer');

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      "We couldn't load your events",
    );
    buttonNamed(el, 'Try again')?.click();
    await settle(fixture);
    expect(el.querySelector('h1')?.textContent).toContain('Odoi Funeral');
  });

  it('still lists donations when recorder names fail to load', async () => {
    backend.listTeamMembersIncludingRevoked.mockRejectedValue(new Error('offline'));
    const { el } = await render('organizer');

    expect(rows(el)).toHaveLength(2);
    expect(rows(el)[0].textContent).toContain('Not on your team');
  });
});
