import { TestBed } from '@angular/core/testing';
import { RevokeMemberDialog } from './revoke-member-dialog';
import type { RevocationChoice, TeamMember } from '../../../../../data/models/team-member';

// Story 7.3 (FR-13/FR-24): a revoke can't be confirmed without saying routine or for-cause.

const MEMBER: TeamMember = {
  membershipId: 'm-op',
  userId: 'op',
  name: 'Kwesi Boateng',
  email: 'kwesi@a.co',
  role: 'operator',
  status: 'active',
  grantedAt: '2026-09-01T00:00:00.000Z',
  isSelf: false,
};

describe('RevokeMemberDialog', () => {
  async function render() {
    const fixture = TestBed.createComponent(RevokeMemberDialog);
    fixture.componentRef.setInput('member', MEMBER);
    fixture.componentRef.setInput('companyName', 'Asante Events');
    const emitted: RevocationChoice[] = [];
    fixture.componentInstance.confirmed.subscribe((choice) => emitted.push(choice));
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, emitted };
  }

  const submit = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

  function choose(el: HTMLElement, value: string) {
    el.querySelector<HTMLInputElement>(`input[value="${value}"]`)!.click();
  }

  it('offers the two kinds of revoke as a labelled, required choice — never one generic revoke', async () => {
    const { el } = await render();

    const dialog = el.querySelector('[role="alertdialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain("Revoke Kwesi Boateng's access?");
    expect(el.querySelector('legend')?.textContent).toContain('Why are you revoking');
    const radios = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.map((r) => r.value)).toEqual(['routine', 'for_cause']);
    expect(radios.every((r) => !r.checked)).toBe(true);
    expect(el.querySelector('textarea')).toBeNull();
  });

  it('refuses to confirm without a reason, and moves focus to the choice', async () => {
    const { fixture, el, emitted } = await render();

    submit(el);
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(el.textContent).toContain("Choose why you're revoking their access.");
    expect((document.activeElement as HTMLInputElement | null)?.value).toBe('routine');
  });

  it('confirms a routine revoke with no explanation attached', async () => {
    const { fixture, el, emitted } = await render();

    choose(el, 'routine');
    fixture.detectChanges();
    submit(el);

    expect(emitted).toEqual([{ reason: 'routine' }]);
  });

  it('requires an explanation for a for-cause revoke and sends it trimmed', async () => {
    const { fixture, el, emitted } = await render();

    choose(el, 'for_cause');
    fixture.detectChanges();
    const textarea = el.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(textarea.getAttribute('maxlength')).toBe('500');
    submit(el);
    fixture.detectChanges();
    expect(emitted).toEqual([]);
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(textarea);

    textarea.value = '  Pocketed cash at the funeral  ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    submit(el);

    expect(emitted).toEqual([{ reason: 'for_cause', explanation: 'Pocketed cash at the funeral' }]);
  });

  it('closes on Cancel or Escape without confirming', async () => {
    const { fixture, el, emitted } = await render();
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => dismissed++);

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Cancel')!
      .click();
    el.querySelector('.scrim')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(dismissed).toBe(2);
    expect(emitted).toEqual([]);
  });
});
