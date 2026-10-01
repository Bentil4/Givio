import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import { ServiceError } from '../../../../../core/services/service-error';
import { IdentityReviewDataService } from '../../../../../data/services/identity-review-data.service';
import type {
  IdentityMatch,
  IdentityReview,
  IdentityReviewDecision,
} from '../../../../../data/models/identity-review';
import type { TeamMemberRole } from '../../../../../data/models/team-member';

type ConfirmedDecision = Exclude<IdentityReviewDecision, 'acknowledge'>;

interface PendingDecision {
  readonly decision: ConfirmedDecision;
  readonly review: IdentityReview;
}

interface RowError {
  readonly reviewId: string;
  readonly message: string;
}

const DECISION_COPY: Record<
  ConfirmedDecision,
  { title: (name: string) => string; body: string; cta: string; danger: boolean }
> = {
  confirm: {
    title: (name) => `Confirm ${name} is a real match?`,
    body:
      'Their access is revoked. The company only sees them leave its team list — it is never ' +
      'told why.',
    cta: 'Confirm match',
    danger: true,
  },
  clear: {
    title: (name) => `Clear ${name}?`,
    body:
      'They become an active member with the access their role gives. This clears this one ' +
      'addition only — the same person added at any other company is checked again.',
    cta: 'Clear',
    danger: false,
  },
};

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  organizer: 'Co-Organizer',
  operator: 'Operator',
};

const SOURCE_LABELS: Record<IdentityMatch['source'], string> = {
  identity_flag: 'Identity flag',
  same_tenant: 'Someone at this company',
};

const ANNOUNCEMENTS: Record<IdentityReviewDecision, (name: string) => string> = {
  confirm: (name) => `${name}'s addition confirmed as a match and revoked.`,
  clear: (name) => `${name} cleared and now active.`,
  acknowledge: (name) => `${name}'s addition marked as seen.`,
};

function errorMessage(err: unknown): string {
  return err instanceof ServiceError ? err.message : 'Failed to save your decision';
}

/**
 * Story 7.2 (FR-12/FR-23): the Approvals screen's "Flagged additions" tab — team additions an
 * identity check held for review, plus every co-Organizer addition, which Admin is told about
 * match or not. The queue itself is loaded by the parent (it also feeds the tab's count); each
 * decision is confirmed, sent to the Function, then re-read — never optimistic.
 */
@Component({
  selector: 'app-flagged-additions',
  imports: [MatIconModule, DatePipe, CdkTrapFocus],
  templateUrl: './flagged-additions.html',
  styleUrl: './flagged-additions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlaggedAdditions {
  private readonly reviewData = inject(IdentityReviewDataService);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('flaggedHeading');

  public readonly reviews = input.required<readonly IdentityReview[]>();
  public readonly loading = input(false);
  public readonly loadError = input<string | null>(null);
  public readonly changed = output<void>();
  public readonly retry = output<void>();

  public readonly pending = signal<PendingDecision | null>(null);
  public readonly decidingId = signal<string | null>(null);
  public readonly rowError = signal<RowError | null>(null);
  public readonly announcement = signal('');
  public readonly skeletons = [0, 1];

  public readonly flagged = computed(() => this.reviews().filter((r) => r.status === 'open'));
  public readonly unmatched = computed(() =>
    this.reviews().filter((r) => r.status === 'unmatched'),
  );
  public readonly pendingCopy = computed(() => {
    const p = this.pending();
    if (!p) return null;
    const copy = DECISION_COPY[p.decision];
    return { ...copy, title: copy.title(p.review.name) };
  });

  public roleLabel(role: TeamMemberRole): string {
    return ROLE_LABELS[role];
  }

  public sourceLabel(match: IdentityMatch): string {
    return SOURCE_LABELS[match.source];
  }

  public rowErrorFor(review: IdentityReview): string | null {
    const e = this.rowError();
    return e?.reviewId === review.reviewId ? e.message : null;
  }

  public ask(decision: ConfirmedDecision, review: IdentityReview): void {
    this.rowError.set(null);
    this.pending.set({ decision, review });
  }

  public dismissPending(): void {
    if (this.decidingId() === null) {
      this.pending.set(null);
    }
  }

  public async confirmPending(): Promise<void> {
    const p = this.pending();
    if (!p) return;
    await this.decide(p.review, p.decision);
    this.pending.set(null);
  }

  public async acknowledge(review: IdentityReview): Promise<void> {
    this.rowError.set(null);
    await this.decide(review, 'acknowledge');
  }

  private async decide(review: IdentityReview, decision: IdentityReviewDecision): Promise<void> {
    this.decidingId.set(review.reviewId);
    try {
      await this.reviewData.resolveIdentityReview(review.reviewId, decision);
      this.announcement.set(ANNOUNCEMENTS[decision](review.name));
      this.changed.emit();
      afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    } catch (err) {
      this.rowError.set({ reviewId: review.reviewId, message: errorMessage(err) });
    } finally {
      this.decidingId.set(null);
    }
  }
}
