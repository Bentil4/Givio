import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type AuditAction = 'create' | 'edit' | 'delete' | 'recover' | 'access' | 'assign' | 'security';

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
export class AdminAudit {
  // ── replace with service-backed signals ──────────────────────────────
  public readonly entries = signal<readonly AuditEntry[]>([]);
  public readonly loading = signal(true);
  public readonly actors = signal<readonly string[]>([]);
  // ─────────────────────────────────────────────────────────────────────

  public readonly actionFilter = signal<AuditAction | 'all'>('all');
  public readonly actorFilter = signal<string>('all');
  public readonly search = signal('');
  public readonly exporting = signal(false);

  public readonly actions: (AuditAction | 'all')[] =
    ['all', 'create', 'edit', 'delete', 'recover', 'access', 'assign', 'security'];

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
      case 'recover': return 'is-recover';
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
