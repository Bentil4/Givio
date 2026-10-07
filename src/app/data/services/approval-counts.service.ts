import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { FUNCTIONS } from '../../core/appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';

export interface PendingApprovalCounts {
  readonly applications: number;
  readonly identityReviews: number;
  readonly duplicateEvents: number;
}

const NO_PENDING_APPROVALS: PendingApprovalCounts = {
  applications: 0,
  identityReviews: 0,
  duplicateEvents: 0,
};

const POLL_INTERVAL_MS = 60_000;

/**
 * The Approvals sidebar badge: how many items wait in the Approvals screen's three queues.
 * Counted by the Function, since the review and flag tables are Function-only.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalCountsService {
  private readonly functions = inject(FUNCTIONS);
  private readonly latestCounts = signal(NO_PENDING_APPROVALS);

  public readonly counts = this.latestCounts.asReadonly();
  public readonly total = computed(() => {
    const { applications, identityReviews, duplicateEvents } = this.latestCounts();
    return applications + identityReviews + duplicateEvents;
  });

  /** Refreshes now and then every minute, until `destroyRef` is destroyed. */
  public pollWhileAlive(destroyRef: DestroyRef): void {
    timer(0, POLL_INTERVAL_MS)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => void this.refresh());
  }

  public async refresh(): Promise<void> {
    try {
      const { counts } = await invokeAdminFunction<{ counts: PendingApprovalCounts }>(
        this.functions,
        {
          action: 'countPendingApprovals',
          invokeFailureMessage: 'Failed to count pending approvals',
          payload: {},
        },
      );
      this.latestCounts.set(counts);
    } catch {
      // A badge is a hint, not a result: keep the last known count rather than flash 0.
    }
  }
}
