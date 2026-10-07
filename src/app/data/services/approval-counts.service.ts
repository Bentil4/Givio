import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { FUNCTIONS } from '../../core/appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { SupportRequestDataService } from './support-request-data.service';
import type { ApprovalCountsState, PendingApprovalCounts } from '../models/approval-counts';

const NO_PENDING_APPROVALS: PendingApprovalCounts = {
  applications: 0,
  identityReviews: 0,
  duplicateEvents: 0,
};

const POLL_INTERVAL_MS = 60_000;

/**
 * The Approvals sidebar badge: how many items wait in the Approvals screen's three queues.
 * Counted by the Function, since the review and flag tables are Function-only. The open
 * support requests count for the Support item's badge rides the same poll.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalCountsService {
  private readonly functions = inject(FUNCTIONS);
  private readonly supportRequests = inject(SupportRequestDataService);
  private readonly latestCounts = signal(NO_PENDING_APPROVALS);
  private readonly latestState = signal<ApprovalCountsState>('loading');
  private readonly latestOpenSupport = signal<number | null>(null);

  public readonly counts = this.latestCounts.asReadonly();
  /** Lets a screen tell "none pending" from "not counted yet". */
  public readonly state = this.latestState.asReadonly();
  /** null until a first count arrives; after that, the last known count stands. */
  public readonly openSupportRequests = this.latestOpenSupport.asReadonly();
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
    await Promise.all([this.refreshApprovals(), this.refreshSupportRequests()]);
  }

  public async refreshSupportRequests(): Promise<void> {
    try {
      this.latestOpenSupport.set(await this.supportRequests.countOpenRequests());
    } catch {
      // Same as the approvals badge: keep the last known count rather than flash 0.
    }
  }

  private async refreshApprovals(): Promise<void> {
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
      this.latestState.set('ready');
    } catch {
      // A badge is a hint, not a result: keep the last known count rather than flash 0.
      this.latestState.update((state) => (state === 'ready' ? state : 'unavailable'));
    }
  }
}
