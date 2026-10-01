import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AuditLogService } from '../../../../data/services/audit-log.service';
import { UserService } from '../../../../data/services/user.service';
import type { AdminUser } from '../../../../data/models/admin-user';
import { formatUserDisplay } from '../../../../utils/user-display.util';
import {
  auditActionLabel,
  toAuditEntry,
  type AuditAction,
} from '../../../components/audit-trail/audit-entry';
import { AuditTrailList } from '../../../components/audit-trail/audit-trail-list';

/**
 * The audit trail. Append-only, and the page says so — that claim is the entire value of
 * the feature. Nothing here is editable or deletable by any role, including Admin.
 *
 * It is the answer to the only question that really matters after the event: "who changed
 * this number, when, and why". Every mutation elsewhere in the app writes a row here with a
 * reason attached, which is why the edit and delete dialogs make the reason mandatory.
 *
 * Admin's own reads of tenant Events/Donations land here too (Story 8.2, 'access' rows), so the
 * viewer's own access is self-visible. Loading this page reads audit_logs only, which is never
 * itself access-logged — otherwise every visit would add to the trail it displays.
 */
@Component({
  selector: 'app-admin-audit',
  imports: [MatIconModule, AuditTrailList],
  templateUrl: './admin-audit.html',
  styleUrl: './admin-audit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAudit implements OnInit {
  private readonly auditLogService = inject(AuditLogService);
  private readonly userService = inject(UserService);

  public readonly entries = computed(() => this.auditLogService.entries().map(toAuditEntry));
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly usersById = signal<ReadonlyMap<string, AdminUser>>(new Map());
  // Kept keyed by the raw actor id — actorFilter()/search still match against it — the display
  // name is resolved separately by actorName(), only at render time.
  public readonly actors = computed(() => [...new Set(this.entries().map((e) => e.actor))]);

  public readonly actionFilter = signal<AuditAction | 'all'>('all');
  public readonly actorFilter = signal<string>('all');
  public readonly search = signal('');

  async ngOnInit(): Promise<void> {
    try {
      const [, usersById] = await Promise.all([
        this.auditLogService.loadAuditLogs(),
        this.userService.getUsersById(),
      ]);
      this.usersById.set(usersById);
    } catch {
      this.loadError.set('Failed to load the audit trail.');
    } finally {
      this.loading.set(false);
    }
  }

  /** A bare user id means nothing on screen — resolves it to "Name (email)". An arrow so the
   *  shared trail list can call it unbound. */
  public readonly actorName = (id: string): string =>
    formatUserDisplay(this.usersById().get(id), id);
  public readonly exporting = signal(false);

  public readonly actions: (AuditAction | 'all')[] = [
    'all',
    'create',
    'edit',
    'delete',
    'restore',
    'access',
    'assign',
    'security',
  ];

  public readonly skeletons = Array.from({ length: 8 }, (_, i) => i);

  public readonly visible = computed(() => {
    const action = this.actionFilter();
    const actor = this.actorFilter();
    const needle = this.search().trim().toLowerCase();

    return this.entries().filter((e) => {
      if (action !== 'all' && e.action !== action) return false;
      if (actor !== 'all' && e.actor !== actor) return false;
      if (needle) {
        // Includes the resolved name/email, not just the raw actor id — an Admin searches for
        // who did something by name, not by an id they've never seen.
        const hay = (
          e.summary +
          ' ' +
          (e.detail ?? '') +
          ' ' +
          this.actorName(e.actor)
        ).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  });

  public readonly isEmpty = computed(() => !this.loading() && this.visible().length === 0);
  public readonly filtered = computed(
    () => this.actionFilter() !== 'all' || this.actorFilter() !== 'all' || !!this.search().trim(),
  );

  public readonly actionLabel = auditActionLabel;

  public setAction(a: AuditAction | 'all'): void {
    this.actionFilter.set(a);
  }
  public setActor(a: string): void {
    this.actorFilter.set(a);
  }
  public setSearch(v: string): void {
    this.search.set(v);
  }

  public clearFilters(): void {
    this.actionFilter.set('all');
    this.actorFilter.set('all');
    this.search.set('');
  }

  public async exportTrail(): Promise<void> {
    this.exporting.set(true);
    try {
      // await auditService.export({ action, actor, search });
    } finally {
      this.exporting.set(false);
    }
  }
}
