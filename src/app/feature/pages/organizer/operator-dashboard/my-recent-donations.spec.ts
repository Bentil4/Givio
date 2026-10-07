import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { makeDonation } from '../../../../data/models/donation-test-fixtures';
import { MyRecentDonations } from './my-recent-donations';

describe('MyRecentDonations', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  async function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(MyRecentDonations);
    const defaults = { donations: [], state: 'ready', emptyText: 'No donations yet today' };
    for (const [name, value] of Object.entries({ ...defaults, ...inputs })) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture;
  }

  const textOf = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('lists each donation with its receipt number, donor, type and amount', async () => {
    const fixture = await render({
      donations: [
        makeDonation({ receiptNumber: 'FUN-0042', donorName: 'Kofi Mensah' }),
        makeDonation({
          id: 'd2',
          amountMinor: null,
          donationType: 'in_kind',
          syncStatus: 'pending',
        }),
      ],
    });
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('li');

    expect(rows).toHaveLength(2);
    expect(textOf(rows[0])).toContain('Kofi Mensah');
    expect(textOf(rows[0])).toContain('FUN-0042');
    expect(textOf(rows[0])).toContain('Cash');
    expect(textOf(rows[0])).toContain('GH₵ 500.00');
    expect(textOf(rows[0])).not.toContain('Waiting to sync');
    expect(textOf(rows[1])).toContain('In-kind');
    expect(textOf(rows[1])).toContain('Waiting to sync');
  });

  it('shows the empty text when there is nothing yet', async () => {
    const fixture = await render({});

    expect(textOf(fixture.nativeElement)).toContain('No donations yet today');
  });

  it('offers a retry when the donations could not be loaded', async () => {
    const fixture = await render({ state: 'error' });
    const retries = vi.fn();
    fixture.componentInstance.retry.subscribe(retries);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('button')!.click();

    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(retries).toHaveBeenCalledTimes(1);
  });
});
