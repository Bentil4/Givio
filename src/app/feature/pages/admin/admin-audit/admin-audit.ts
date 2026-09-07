import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AuditLogService } from '../../../../data/services/audit-log.service';
import type { AuditLogEntry } from '../../../../data/models/audit-log';

export type AuditAction = 'create' | 'edit' | 'delete' | 'restore' | 'access' | 'assign' | 'security';

export interface AuditEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly action: AuditAction;
  /** One sentence naming what happened, in past tense. */
  readonly summary: string;
  /** The supporting detail — a reason, an IP, a device id. */
  readonly detail?: string;
  readonly actor: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Maps the real audit_logs row shape into this page's display shape — every mutation writes
 *  entityType/entityId/previousValues/newValues, not a ready-made sentence, so one gets built
 *  here from whichever side of the change actually has the identifying field. */
function toAuditEntry(entry: AuditLogEntry): AuditEntry {
  const before = asRecord(entry.previousValues);
  const after = asRecord(entry.newValues);
  const noun = entry.entityType === 'event' ? 'Event' : 'Donation';
  const rawLabel = entry.entityType === 'event' ? after['name'] ?? before['name'] : after['receiptNumber'] ?? before['receiptNumber'];
  const label = typeof rawLabel === 'string' ? rawLabel : '';
  const verb: Record<AuditLogEntry['action'], string> = {
    create: 'created',
    edit: 'edited',
    delete: 'deleted',
    restore: 'restored',
  };
  const detail = typeof after['reason'] === 'string' ? after['reason'] : undefined;

  return {
    id: entry.id,
    timestamp: entry.timestamp,
    action: entry.action,
    summary: `${noun} ${label} ${verb[entry.action]}`.trim(),
    detail,
    actor: entry.performedBy,
  };
}

/**
 * The audit trail. Append-only, and the page says so — that claim is the entire value of
 * the feature. Nothing here is editable or deletable by any role, including Admin.
 *
 * It is the answer to the only question that really matters after the event: "who changed
 * this number, when, and why". Every mutation elsewhere in the app writes a row here with a
 * reason attached, which is why the edit and delete dialogs make the reason mandatory.
 */
@Component({
  selector: 'app-admin-audit',
  imports: [MatIconModule],
  templateUrl: './admin-audit.html',
  styleUrl: './admin-audit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAudit implements OnInit {
  private readonly auditLogService = inject(AuditLogService);

  public readonly entries = computed(() => this.auditLogService.entries().map(toAuditEntry));
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly actors = computed(() => [...new Set(this.entries().map((e) => e.actor))]);

  public readonly actionFilter = signal<AuditAction | 'all'>('all');
  public readonly actorFilter = signal<string>('all');
  public readonly search = signal('');

  async ngOnInit(): Promise<void> {
    try {
      await this.auditLogService.loadAuditLogs();
    } catch {
      this.loadError.set('Failed to load the audit trail.');
    } finally {
      this.loading.set(false);
    }
  }
  public readonly exporting = signal(false);

  public readonly actions: (AuditAction | 'all')[] =
    ['all', 'create', 'edit', 'delete', 'restore', 'access', 'assign', 'security'];

  public readonly skeletons = Array.from({ length: 8 }, (_, i) => i);

  public readonly visible = computed(() => {
    const action = this.actionFilter();
    const actor = this.actorFilter();
    const needle = this.search().trim().toLowerCase();

    return this.entries().filter((e) => {
      if (action !== 'all' && e.action !== action) return false;
      if (actor !== 'all' && e.actor !== actor) return false;
      if (needle) {
        const hay = (e.summary + ' ' + (e.detail ?? '') + ' ' + e.actor).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  });

  public readonly isEmpty = computed(() => !this.loading() && this.visible().length === 0);
  public readonly filtered = computed(() =>
    this.actionFilter() !== 'all' || this.actorFilter() !== 'all' || !!this.search().trim(),
  );

  public actionLabel(action: AuditAction | 'all'): string {
    if (action === 'all') return 'All actions';
    return action.charAt(0).toUpperCase() + action.slice(1);
  }

  /** Security rows are the ones an Admin scans for, so they alone carry a warning colour. */
  public actionClass(action: AuditAction): string {
    switch (action) {
      case 'security': return 'is-security';
      case 'delete': return 'is-delete';
      case 'edit': return 'is-edit';
      case 'restore': return 'is-restore';
      default: return 'is-neutral';
    }
  }

  public setAction(a: AuditAction | 'all'): void { this.actionFilter.set(a); }
  public setActor(a: string): void { this.actorFilter.set(a); }
  public setSearch(v: string): void { this.search.set(v); }

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
