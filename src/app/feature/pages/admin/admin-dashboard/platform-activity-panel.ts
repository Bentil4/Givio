import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminUser } from '../../../../data/models/admin-user';
import type { AuditLogEntry } from '../../../../data/models/audit-log';
import { SkeletonRows } from '../../../../shared/components/skeleton-rows/skeleton-rows';
import { formatUserDisplay } from '../../../../utils/user-display.util';
import { toAuditEntry } from '../../../components/audit-trail/audit-entry';
import { AuditTrailList } from '../../../components/audit-trail/audit-trail-list';
import type { LoadState } from './load-state';

/**
 * The newest platform audit entries, in the same rows as the audit trail page. Only platform
 * entries are readable by an Admin (AD-12, amended 2026-10-07), so no company's work shows here.
 */
@Component({
  selector: 'app-platform-activity-panel',
  imports: [RouterLink, SkeletonRows, AuditTrailList],
  template: `
    <section class="activity" aria-labelledby="platform-activity-title">
      <header class="panel-head activity-head">
        <h2 class="t-card-title" id="platform-activity-title">Recent platform activity</h2>
        <a class="panel-link" routerLink="/dashboard/audit">View audit trail</a>
      </header>
      @switch (state()) {
        @case ('loading') {
          <div class="glass activity-box">
            <app-skeleton-rows [rows]="4" label="Loading recent activity…" />
          </div>
        }
        @case ('error') {
          <div class="glass activity-box" role="alert">
            <p class="panel-empty">Couldn't load recent activity.</p>
            <button type="button" class="btn btn-secondary retry" (click)="retry.emit()">
              Try again
            </button>
          </div>
        }
        @default {
          @if (entries().length === 0) {
            <p class="glass activity-box panel-empty">No platform activity recorded yet.</p>
          } @else {
            <app-audit-trail-list [entries]="trailEntries()" [actorName]="actorName" />
          }
        }
      }
    </section>
  `,
  styleUrl: './platform-activity-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformActivityPanel {
  public readonly entries = input.required<readonly AuditLogEntry[]>();
  public readonly state = input.required<LoadState>();
  /** Resolves who acted; an unknown id still shows, as itself. */
  public readonly usersById = input<ReadonlyMap<string, AdminUser>>(new Map());
  public readonly retry = output<void>();

  protected readonly trailEntries = computed(() => this.entries().map(toAuditEntry));

  protected readonly actorName = (id: string): string =>
    formatUserDisplay(this.usersById().get(id), id);
}
