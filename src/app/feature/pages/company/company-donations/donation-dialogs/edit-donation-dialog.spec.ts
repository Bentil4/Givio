import { TestBed } from '@angular/core/testing';
import { makeDonation } from '../../../../../data/models/donation-test-fixtures';
import { EditDonationDialog, type DonationEdit } from './edit-donation-dialog';

describe('EditDonationDialog', () => {
  async function render(overrides = {}) {
    const fixture = TestBed.createComponent(EditDonationDialog);
    fixture.componentRef.setInput(
      'donation',
      makeDonation({ onBehalfOf: 'The Asante Family', ...overrides }),
    );
    fixture.componentRef.setInput('recorderName', 'Kwesi Boateng');
    const saved: DonationEdit[] = [];
    fixture.componentInstance.saved.subscribe((edit) => saved.push(edit));
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, saved };
  }

  function typeInto(el: HTMLElement, id: string, value: string) {
    const field = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  const submit = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

  it('opens as a labelled modal, prefilled, naming the recorder', async () => {
    const { el } = await render();

    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Correct donation FUN-0001');
    expect(dialog.textContent).toContain('Kwesi Boateng');
    expect(el.querySelector<HTMLInputElement>('#editDonationAmount')!.value).toBe('500.00');
  });

  it('refuses a correction without a reason and focuses the first invalid field', async () => {
    const { fixture, el, saved } = await render();

    typeInto(el, 'editDonationAmount', '12.345');
    submit(el);
    fixture.detectChanges();

    expect(saved).toEqual([]);
    expect(document.activeElement?.id).toBe('editDonationAmount');
    expect(el.querySelector('#editDonationAmount')?.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#editDonationReason')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('emits the four fields and the trimmed reason; a blank on-behalf-of clears it', async () => {
    const { el, saved } = await render();

    typeInto(el, 'editDonationAmount', '');
    typeInto(el, 'editDonationBehalf', '   ');
    typeInto(el, 'editDonationReason', '  It was an in-kind gift of rice  ');
    submit(el);

    expect(saved).toEqual([
      {
        patch: {
          donorName: 'Ama Owusu',
          amountMinor: null,
          donationType: 'cash',
          onBehalfOf: null,
        },
        reason: 'It was an in-kind gift of rice',
      },
    ]);
  });

  it('closes on Cancel or Escape', async () => {
    const { fixture, el } = await render();
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => dismissed++);

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Cancel')!
      .click();
    el.querySelector('.scrim')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(dismissed).toBe(2);
  });
});
