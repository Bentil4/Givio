import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TenantAuditDataService } from '../../../../data/services/tenant-audit-data.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import { ServiceError } from '../../../../core/services/service-error';
import type { AuditLogEntry } from '../../../../data/models/audit-log';
import type { TeamMember } from '../../../../data/models/team-member';
import { formatUserDisplay } from '../../../../utils/user-display.util';
import { toAuditEntry } from '../../../components/audit-trail/audit-entry';
import { AuditTrailList } from '../../../components/audit-trail/audit-trail-list';

// Revoked members and Givio staff aren't in the team list, and a tenant isn't told who they are.
const NOT_ON_TEAM = 'Not on your team';

/**
 * /company/audit (Story 7.5, FR-15): the Super Organizer's own tenant's activity trail, newest
 * first, one server page at a time. The Function decides what this tenant may see; the page
 * only renders it — the same rows, read the same way, as Admin's platform-wide admin-audit.
 */
@Component({
  selector: 'app-company-audit',
  imports: [MatIconModule, AuditTrailList],
  templateUrl: './company-audit.html',
  styleUrl: './company-audit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyAudit implements OnInit {
  private readonly auditData = inject(TenantAuditDataService);
  private readonly teamData = inject(TeamDataService);

  private readonly rows = signal<readonly AuditLogEntry[]>([]);
  private readonly membersById = signal<ReadonlyMap<string, TeamMember>>(new Map());
  private readonly nextCursor = signal<string | null>(null);
  public readonly loading = signal(true);
  public readonly loadingMore = signal(false);
  public readonly loadError = signal<string | null>(null);
  public readonly skeletons = [0, 1, 2, 3];

  public readonly entries = computed(() => this.rows().map(toAuditEntry));
  public readonly hasMore = computed(() => this.nextCursor() !== null);
  public readonly isEmpty = computed(
    () => !this.loading() && this.loadError() === null && this.rows().length === 0,
  );

  public readonly actorName = (id: string): string =>
    formatUserDisplay(this.membersById().get(id), NOT_ON_TEAM);

  ngOnInit(): void {
    void this.loadMemberNames();
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.rows.set([]);
    await this.appendNextPage(null);
    this.loading.set(false);
  }

  async loadOlder(): Promise<void> {
    this.loadingMore.set(true);
    await this.appendNextPage(this.nextCursor());
    this.loadingMore.set(false);
  }

  /** A failed first page reloads from the top; a failed later page retries just that page. */
  retry(): Promise<void> {
    return this.hasMore() ? this.loadOlder() : this.load();
  }

  private async appendNextPage(cursor: string | null): Promise<void> {
    try {
      const page = await this.auditData.listTenantAuditPage(cursor);
      this.rows.update((rows) => [...rows, ...page.entries]);
      this.nextCursor.set(page.nextCursor);
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(
        err instanceof ServiceError ? err.message : "We couldn't load your activity log",
      );
    }
  }

  // Names are a nicety: if the team can't be listed, entries still show, just less legibly.
  private async loadMemberNames(): Promise<void> {
    try {
      const members = await this.teamData.listTeamMembers();
      this.membersById.set(new Map(members.map((m) => [m.userId, m])));
    } catch (err) {
      console.error('CompanyAudit: failed to load team member names', err);
    }
  }
}
