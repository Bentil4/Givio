import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PendingQueue } from './pending-queue';
import type { DonationDraft } from '../../../data/models/donation';

const draft = (overrides: Partial<DonationDraft> = {}): DonationDraft => ({
  localId: '1',
  eventId: 'e1',
  donorName: 'Ama',
  amountMinor: 5000,
  donationType: 'cash',
  ...overrides,
});

describe('PendingQueue', () => {
  let fixture: ComponentFixture<PendingQueue>;
  let el: HTMLElement;

  const render = async (
    drafts: readonly DonationDraft[],
    rejected: readonly DonationDraft[] = [],
  ) => {
    fixture.componentRef.setInput('drafts', drafts);
    fixture.componentRef.setInput('rejected', rejected);
    fixture.componentRef.setInput('online', true);
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const button = (text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PendingQueue] });
    fixture = TestBed.createComponent(PendingQueue);
    el = fixture.nativeElement;
  });

  it('shows rejected records separately, with the server reason, outside the pending count and total', async () => {
    await render(
      [draft({ localId: '1', donorName: 'Kofi', amountMinor: 1000 })],
      [
        draft({
          localId: '2',
          donorName: 'Ama',
          amountMinor: 5000,
          receiptNumber: 'WEDE1-P2',
          rejectionReason: 'You are not assigned to this event',
        }),
      ],
    );

    const rejected = el.querySelector('.queue-rejected');
    expect(rejected?.textContent).toContain('Rejected by server');
    expect(rejected?.textContent).toContain(
      'Rejected by server — You are not assigned to this event',
    );
    expect(rejected?.textContent).toContain('WEDE1-P2');
    const summary = el.querySelector('.queue-heading p')?.textContent ?? '';
    expect(summary).toContain('1');
    expect(summary).toContain('donation stored');
    expect(summary).toContain('10.00');
    expect(summary).not.toContain('60.00');
  });

  it('describes the real retry behaviour and offers no dead Edit or Discard actions', async () => {
    await render([draft()]);

    expect(el.textContent).toContain('keep trying to sync automatically');
    expect(el.textContent).not.toContain('3 times');
    expect(el.textContent).not.toContain('Admin is notified');
    expect(el.textContent).not.toContain('attempt');
    expect(button('Edit')).toBeUndefined();
    expect(button('Discard')).toBeUndefined();
    expect(button('Sync now')).toBeDefined();
  });

  it('shows the rejected section even when nothing else is pending', async () => {
    await render([], [draft({ rejectionReason: 'Event not found' })]);

    expect(el.querySelector('.queue-rejected')).not.toBeNull();
    expect(el.querySelector('.queue-empty')).toBeNull();
  });

  it('asks for confirmation before dismissing, focusing the safe choice', async () => {
    const rejectedDraft = draft({ rejectionReason: 'Event not found' });
    await render([], [rejectedDraft]);
    const emitted: DonationDraft[] = [];
    fixture.componentInstance.dismiss.subscribe((d) => emitted.push(d));

    el.querySelector<HTMLButtonElement>('button[aria-label^="Dismiss rejected"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emitted).toHaveLength(0);
    expect(document.activeElement).toBe(button('Keep'));

    button('Remove')!.click();
    expect(emitted).toEqual([rejectedDraft]);
  });

  it('Keep cancels the dismissal without emitting', async () => {
    await render([], [draft({ rejectionReason: 'Event not found' })]);
    const emitted: DonationDraft[] = [];
    fixture.componentInstance.dismiss.subscribe((d) => emitted.push(d));

    el.querySelector<HTMLButtonElement>('button[aria-label^="Dismiss rejected"]')!.click();
    fixture.detectChanges();
    button('Keep')!.click();
    fixture.detectChanges();

    expect(emitted).toHaveLength(0);
    expect(button('Remove')).toBeUndefined();
  });
});
