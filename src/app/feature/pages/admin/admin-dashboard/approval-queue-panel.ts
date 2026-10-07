import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type {
  ApprovalCountsState,
  PendingApprovalCounts,
} from '../../../../data/models/approval-counts';
import { SkeletonRows } from '../../../../shared/components/skeleton-rows/skeleton-rows';
import type { ApprovalsTab } from '../admin-approvals/approvals-tab';
import { formatCount } from './platform-metrics';

interface QueueRow {
  readonly tab: ApprovalsTab;
  readonly label: string;
  readonly count: string;
}

/** What waits in each Approvals queue, each row opening that queue's tab. */
@Component({
  selector: 'app-approval-queue-panel',
  imports: [MatIconModule, RouterLink, SkeletonRows],
  template: `
    <article class="panel glass" aria-labelledby="approval-queue-title">
      <header class="panel-head">
        <h2 class="t-card-title" id="approval-queue-title">Approval queues</h2>
        <a class="panel-link" routerLink="/dashboard/approvals">All approvals</a>
      </header>
      @switch (state()) {
        @case ('loading') {
          <app-skeleton-rows [rows]="3" label="Loading approval queues…" />
        }
        @case ('unavailable') {
          <p class="panel-empty">Couldn't count the approval queues. They refresh every minute.</p>
        }
        @default {
          <ul class="panel-body queue-list">
            @for (row of rows(); track row.tab) {
              <li>
                <a
                  class="feed-row queue-row"
                  routerLink="/dashboard/approvals"
                  [queryParams]="{ tab: row.tab }"
                >
                  <span class="t-body-em">{{ row.label }}</span>
                  <span class="queue-count">
                    <span class="is-mono is-strong">{{ row.count }}</span>
                    <mat-icon class="queue-chevron" aria-hidden="true">chevron_right</mat-icon>
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      }
    </article>
  `,
  styleUrl: './approval-queue-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApprovalQueuePanel {
  public readonly counts = input.required<PendingApprovalCounts>();
  public readonly state = input.required<ApprovalCountsState>();

  protected readonly rows = computed<QueueRow[]>(() => {
    const { applications, identityReviews, duplicateEvents } = this.counts();
    return [
      { tab: 'applications', label: 'Organizer applications', count: formatCount(applications) },
      { tab: 'flagged', label: 'Flagged additions', count: formatCount(identityReviews) },
      { tab: 'duplicates', label: 'Duplicate events', count: formatCount(duplicateEvents) },
    ];
  });
}
