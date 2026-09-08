import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { appDb } from '../../../../data/dexie/app-db';
import { EventService } from '../../../../data/services/event.service';
import { UserService } from '../../../../data/services/user.service';
import { ServiceError } from '../../../../data/services/service-error';
import type { Event } from '../../../../data/models/event';
import { EVENT_STATUS_CHIP } from '../../../../data/models/event';
import type { AdminUser } from '../../../../data/models/admin-user';

type Confirmable = 'pause' | 'resume' | 'close' | 'generate' | 'regenerate' | null;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/**
 * One event: its code, its operator roster, and its irreversible actions.
 *
 * Loading and the "Edit details" link are real (Dexie, the same source edit-event.ts reads
 * from). Operator assignment is real (Story 2.3 — EventService.assignOperators, backed by
 * the set-role-and-permissions Function's assignOperators action, which recomputes the
 * Event document's Appwrite permissions per AD-2). Regenerate is real too (Story 2.4 —
 * EventService.regenerateAccessCode, backed by the same Function's generateAccessCode
 * action). Pause / resume / close are still NOT wired to anything — this repo has no
 * event-status-lifecycle service (Story 2.2) yet. Confirming one of those surfaces an honest
 * "not built yet" message rather than silently no-op'ing or faking success. The UI is kept
 * (not deleted) because it's the intended shape once that story lands — see
 * docs/design-handoff/INTEGRATION-STATUS.md.
 */
@Component({
  selector: 'app-admin-event-detail',
  imports: [MatIconModule, RouterLink],
  templateUrl: './admin-event-detail.html',
  styleUrl: './admin-event-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEventDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly eventService = inject(EventService);
  private readonly userService = inject(UserService);

  public readonly event = signal<Event | null>(null);
  public readonly loading = signal(true);
  public readonly notFound = signal(false);

  public readonly availableOperators = signal<readonly AdminUser[]>([]);
  public readonly selectedOperatorIds = signal<ReadonlySet<string>>(new Set());
  public readonly assignBusy = signal(false);
  public readonly assignError = signal<string | null>(null);
  public readonly assignSaved = signal(false);

  public readonly confirming = signal<Confirmable>(null);
  public readonly busy = signal(false);
  public readonly copied = signal(false);
  public readonly actionError = signal<string | null>(null);

  public readonly chipClass = EVENT_STATUS_CHIP;

  /** Donation totals need Epic 3's Donation collection, which doesn't exist yet. */
  public readonly totalLabel = computed(() => 'GH₵ 0.00');

  public readonly statusLabel = computed(() => {
    const s = this.event()?.status;
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  });

  public readonly canPause = computed(() => this.event()?.status === 'active');
  public readonly canResume = computed(() => this.event()?.status === 'paused');
  public readonly isClosed = computed(() => this.event()?.status === 'closed');
  public readonly hasCode = computed(() => !!this.event()?.accessCode && !this.isClosed());

  public readonly assignedOperators = computed(() => {
    const ids = new Set(this.event()?.assignedUserIds ?? []);
    return this.availableOperators().filter((op) => ids.has(op.id));
  });

  public readonly assignmentDirty = computed(() => {
    const current = new Set(this.event()?.assignedUserIds ?? []);
    return !sameIds(current, this.selectedOperatorIds());
  });

  public readonly confirmCopy = computed(() => {
    switch (this.confirming()) {
      case 'pause':
        return {
          title: 'Pause giving?',
          body: 'Operators will not be able to save donations until you resume. Family members keep '
            + 'their access and see the last known total.',
          cta: 'Pause giving',
          danger: false,
        };
      case 'resume':
        return {
          title: 'Resume giving?',
          body: 'Operators at every desk will be able to record donations again immediately.',
          cta: 'Resume giving',
          danger: false,
        };
      case 'close':
        return {
          title: 'Close and archive this event?',
          body: 'This locks all donations recorded so far, invalidates the family code, and archives '
            + 'the record. It cannot be reopened — only an export remains.',
          cta: 'Close and archive',
          danger: true,
        };
      case 'generate':
        return {
          title: 'Generate a family access code?',
          body: 'Family members will use this code to view a live, read-only summary of the giving — '
            + 'no account needed. You can share it as soon as it\'s generated.',
          cta: 'Generate code',
          danger: false,
        };
      case 'regenerate':
        return {
          title: 'Regenerate the family code?',
          body: 'The current code stops working immediately and every family member using it will be '
            + 'signed out. You will need to share the new code with everyone again.',
          cta: 'Regenerate code',
          danger: true,
        };
      default:
        return null;
    }
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    const event = await appDb.events.get(id);
    if (!event) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    this.event.set(event);
    this.selectedOperatorIds.set(new Set(event.assignedUserIds));
    this.loading.set(false);

    try {
      const users = await this.userService.listUsers();
      this.availableOperators.set(users.filter((u) => u.role === 'operator' && u.active));
    } catch {
      // The assignment card is a nice-to-have on this page; a failed lookup just leaves it
      // empty rather than blocking the rest of the (already-loaded) event detail.
      this.availableOperators.set([]);
    }
  }

  public initialsOf(name: string): string {
    return initialsOf(name);
  }

  public toggleOperator(id: string): void {
    this.selectedOperatorIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  public isSelected(id: string): boolean {
    return this.selectedOperatorIds().has(id);
  }

  public resetAssignment(): void {
    this.assignError.set(null);
    this.selectedOperatorIds.set(new Set(this.event()?.assignedUserIds ?? []));
  }

  public async saveAssignment(): Promise<void> {
    const event = this.event();
    if (!event) return;

    this.assignBusy.set(true);
    this.assignError.set(null);
    try {
      const updated = await this.eventService.assignOperators(event.id, [...this.selectedOperatorIds()]);
      this.event.set(updated);
      this.assignSaved.set(true);
      setTimeout(() => this.assignSaved.set(false), 2000);
    } catch (err) {
      this.assignError.set(err instanceof ServiceError ? err.message : 'Failed to save operator assignment');
    } finally {
      this.assignBusy.set(false);
    }
  }

  public ask(action: Confirmable): void {
    this.actionError.set(null);
    this.confirming.set(action);
  }

  public dismiss(): void { this.confirming.set(null); }

  public async confirm(): Promise<void> {
    const action = this.confirming();
    const event = this.event();
    if (!event) return;

    if (action !== 'generate' && action !== 'regenerate') {
      // Pause/resume/close need Story 2.2's event-status-lifecycle service, which doesn't
      // exist yet — see this component's doc comment.
      this.actionError.set('This action isn’t available yet in this build.');
      return;
    }

    this.busy.set(true);
    this.actionError.set(null);
    try {
      const updated = await this.eventService.regenerateAccessCode(event.id);
      this.event.set(updated);
      this.confirming.set(null);
    } catch (err) {
      this.actionError.set(err instanceof ServiceError ? err.message : 'Failed to regenerate the family code');
    } finally {
      this.busy.set(false);
    }
  }

  public async copyCode(): Promise<void> {
    const code = this.event()?.accessCode;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
