import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceError } from '../../../../../core/services/service-error';
import { IdentityReviewDataService } from '../../../../../data/services/identity-review-data.service';
import type { IdentityReview } from '../../../../../data/models/identity-review';
import { FlaggedAdditions } from './flagged-additions';

const HELD: IdentityReview = {
  reviewId: 'r1',
  membershipId: 'm1',
  tenantId: 't1',
  tenantName: 'Asante Events',
  name: 'Kojo Mensah',
  email: 'kojo@asante.example',
  phone: '+233241234567',
  role: 'operator',
  matched: true,
  matches: [
    {
      source: 'identity_flag',
      id: 'f1',
      fields: ['email'],
      name: 'kojo mensah',
      email: 'kojo@asante.example',
      phone: null,
      reason: 'Revoked for cause',
    },
  ],
  status: 'open',
  createdAt: '2026-09-30T09:00:00.000Z',
};
const CHECKED: IdentityReview = {
  ...HELD,
  reviewId: 'r2',
  name: 'Esi Arthur',
  email: 'esi@asante.example',
  role: 'organizer',
  matched: false,
  matches: [],
  status: 'unmatched',
};

describe('FlaggedAdditions', () => {
  let fixture: ComponentFixture<FlaggedAdditions>;
  let component: FlaggedAdditions;
  let resolveIdentityReview: ReturnType<typeof vi.fn>;
  let changedCount: number;

  function render(reviews: readonly IdentityReview[], extra: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(FlaggedAdditions);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('reviews', reviews);
    for (const [key, value] of Object.entries(extra)) {
      fixture.componentRef.setInput(key, value);
    }
    changedCount = 0;
    component.changed.subscribe(() => changedCount++);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    resolveIdentityReview = vi.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [FlaggedAdditions],
      providers: [{ provide: IdentityReviewDataService, useValue: { resolveIdentityReview } }],
    }).compileComponents();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  it('lists held additions with what they matched, and co-Organizer additions that did not match', () => {
    render([HELD, CHECKED]);

    expect(text()).toContain('Held for your review (1)');
    expect(text()).toContain('Same email as kojo mensah');
    expect(text()).toContain('Flagged: Revoked for cause');
    expect(text()).toContain('checked, no match (1)');
    expect(text()).toContain('Esi Arthur');
  });

  it('shows an empty state when nothing is waiting', () => {
    render([]);

    expect(text()).toContain('No additions waiting');
  });

  it('confirming asks first, then sends the decision and asks the parent to re-read', async () => {
    render([HELD]);

    component.ask('confirm', HELD);
    fixture.detectChanges();
    expect(el().querySelector('[role="alertdialog"]')?.textContent).toContain(
      'Confirm Kojo Mensah is a real match?',
    );
    await component.confirmPending();
    fixture.detectChanges();

    expect(resolveIdentityReview).toHaveBeenCalledWith('r1', 'confirm');
    expect(changedCount).toBe(1);
    expect(el().querySelector('[role="alertdialog"]')).toBeNull();
    expect(component.announcement()).toContain('confirmed');
  });

  it('marks a no-match co-Organizer addition as seen without a dialog', async () => {
    render([CHECKED]);

    (el().querySelector('.row--compact button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(resolveIdentityReview).toHaveBeenCalledWith('r2', 'acknowledge'));
  });

  it('keeps the row and shows the refusal when a decision fails', async () => {
    resolveIdentityReview.mockRejectedValueOnce(new ServiceError('This review is confirmed'));
    render([HELD]);

    component.ask('clear', HELD);
    await component.confirmPending();
    fixture.detectChanges();

    expect(changedCount).toBe(0);
    expect(el().querySelector('.row-error')?.textContent).toContain('This review is confirmed');
  });

  it('offers a retry when the queue failed to load', () => {
    render([], { loadError: 'Failed to load flagged additions' });
    let retried = false;
    component.retry.subscribe(() => (retried = true));

    (el().querySelector('[role="alert"] button') as HTMLButtonElement).click();

    expect(retried).toBe(true);
  });
});
