import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceError } from '../../../../../core/services/service-error';
import { DuplicateEventFlagDataService } from '../../../../../data/services/duplicate-event-flag-data.service';
import type {
  DuplicateEventFlag,
  FlaggedEvent,
} from '../../../../../data/models/duplicate-event-flag';
import { DuplicateEvents } from './duplicate-events';

const NEW_EVENT: FlaggedEvent = {
  id: 'e-new',
  name: 'Funeral of the Late Kwame Mensah',
  hostName: 'The Mensah Family',
  type: 'funeral',
  date: '2026-11-07T00:00:00.000+00:00',
  venue: 'Osu Presbyterian Church',
  status: 'active',
  tenantId: 't1',
  tenantName: 'Asante Events',
};
const FLAG: DuplicateEventFlag = {
  flagId: 'f1',
  matchedOn: ['name', 'hostName'],
  flaggedAt: '2026-10-01T09:00:00.000Z',
  event: NEW_EVENT,
  matchedEvent: {
    ...NEW_EVENT,
    id: 'e-old',
    name: 'Kwame Mensah Burial Service',
    date: '2026-11-10T00:00:00.000+00:00',
    venue: null,
    tenantId: null,
    tenantName: null,
  },
};

describe('DuplicateEvents', () => {
  let fixture: ComponentFixture<DuplicateEvents>;
  let component: DuplicateEvents;
  let resolveDuplicateEventFlag: ReturnType<typeof vi.fn>;
  let changedCount: number;

  function render(flags: readonly DuplicateEventFlag[], extra: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(DuplicateEvents);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('flags', flags);
    for (const [key, value] of Object.entries(extra)) {
      fixture.componentRef.setInput(key, value);
    }
    changedCount = 0;
    component.changed.subscribe(() => changedCount++);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    resolveDuplicateEventFlag = vi.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [DuplicateEvents],
      providers: [
        { provide: DuplicateEventFlagDataService, useValue: { resolveDuplicateEventFlag } },
      ],
    }).compileComponents();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const dialog = () => el().querySelector('[role="alertdialog"]');

  it('shows both Events side by side with their owners, dates and what matched', () => {
    render([FLAG]);

    expect(text()).toContain('Possible duplicate: same event name and host');
    expect(text()).toContain('Funeral of the Late Kwame Mensah');
    expect(text()).toContain('Asante Events');
    expect(text()).toContain('Kwame Mensah Burial Service');
    expect(text()).toContain('Created by Admin');
    expect(text()).toContain('Nov 10, 2026');
    // AD-12 (amended 2026-10-07): Admin has no event detail page to link to.
    expect(el().querySelector('.side-link')).toBeNull();
  });

  it('shows the empty-queue state when nothing is waiting', () => {
    render([]);

    expect(text()).toContain('No duplicate events waiting');
    expect(el().querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('shows a loading state, never the empty state, while the queue loads', () => {
    render([], { loading: true });

    expect(el().querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(text()).not.toContain('No duplicate events waiting');
  });

  it('clearing asks first, then sends the decision and asks the parent to re-read', async () => {
    render([FLAG]);

    component.ask('clear', FLAG);
    fixture.detectChanges();
    expect(dialog()?.textContent).toContain('never flagged together again');
    await component.confirmPending();
    fixture.detectChanges();

    expect(resolveDuplicateEventFlag).toHaveBeenCalledWith('f1', 'clear');
    expect(changedCount).toBe(1);
    expect(dialog()).toBeNull();
    expect(component.announcement()).toBe('Flag cleared.');
  });

  it('confirming a genuine duplicate sends confirm', async () => {
    render([FLAG]);

    const confirm = el().querySelector<HTMLButtonElement>('.row-actions .btn-primary')!;
    confirm.click();
    fixture.detectChanges();
    expect(dialog()?.textContent).toContain('Confirm these are the same event?');
    await component.confirmPending();

    expect(resolveDuplicateEventFlag).toHaveBeenCalledWith('f1', 'confirm');
  });

  it('cancelling the dialog sends nothing', () => {
    render([FLAG]);

    component.ask('confirm', FLAG);
    component.dismissPending();
    fixture.detectChanges();

    expect(dialog()).toBeNull();
    expect(resolveDuplicateEventFlag).not.toHaveBeenCalled();
  });

  it('keeps the flag and shows the refusal when a decision fails', async () => {
    resolveDuplicateEventFlag.mockRejectedValueOnce(
      new ServiceError('This flag is already cleared'),
    );
    render([FLAG]);

    component.ask('clear', FLAG);
    await component.confirmPending();
    fixture.detectChanges();

    expect(changedCount).toBe(0);
    expect(el().querySelector('.row-error')?.textContent).toContain('This flag is already cleared');
  });

  it('offers a retry when the queue failed to load', () => {
    render([], { loadError: 'Failed to load duplicate-event flags' });
    let retried = false;
    component.retry.subscribe(() => (retried = true));

    (el().querySelector('[role="alert"] button') as HTMLButtonElement).click();

    expect(retried).toBe(true);
  });
});
