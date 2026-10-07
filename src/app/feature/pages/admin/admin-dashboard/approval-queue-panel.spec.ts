import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApprovalQueuePanel } from './approval-queue-panel';

describe('ApprovalQueuePanel', () => {
  async function render(state: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ApprovalQueuePanel);
    fixture.componentRef.setInput('counts', {
      applications: 2,
      identityReviews: 1,
      duplicateEvents: 0,
    });
    fixture.componentRef.setInput('state', state);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('links each queue, with its count, to its tab on the Approvals page', async () => {
    const el = await render('ready');

    const rows = [...el.querySelectorAll<HTMLAnchorElement>('.queue-row')];
    const rowText = (a: Element) =>
      `${a.querySelector('.t-body-em')?.textContent} ${a.querySelector('.is-mono')?.textContent}`;
    expect(rows.map(rowText)).toEqual([
      'Organizer applications 2',
      'Flagged additions 1',
      'Duplicate events 0',
    ]);
    expect(rows.map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard/approvals?tab=applications',
      '/dashboard/approvals?tab=flagged',
      '/dashboard/approvals?tab=duplicates',
    ]);
  });

  it('says the queues could not be counted rather than showing zeros', async () => {
    const el = await render('unavailable');

    expect(el.querySelector('.queue-row')).toBeNull();
    expect(el.textContent).toContain("Couldn't count the approval queues.");
  });
});
