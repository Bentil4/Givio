import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { EventService } from '../../../../data/services/event.service';
import { UserService } from '../../../../data/services/user.service';
import { ServiceError } from '../../../../data/services/service-error';
import type { Event, EventStatus, EventType } from '../../../../data/models/event';
import { EVENT_STATUS_CHIP } from '../../../../data/models/event';
import type { AdminUser } from '../../../../data/models/admin-user';

/**
 * Event management. Status is the gate on everything downstream, so the table leads with it
 * and every row's action names the outcome:
 *   active -> manage / pause
 *   paused -> resume
 *   closed -> export only
 *
 * (The design this screen was adapted from also modelled a `draft` status — doesn't exist in
 * this repo yet, events go straight to `active` on creation, Story 2.1.)
 *
 * The create dialog's "Assign operators" section is real: selecting operators there gets
 * them assigned immediately after the event is created (EventService.assignOperators, Story
 * 2.3) — see save() below. If assignment fails after a successful create, the event still
 * exists; the error names that explicitly rather than implying the whole create failed.
 */
@Component({
  selector: 'app-admin-events',
  imports: [MatIconModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-events.html',
  styleUrl: './admin-events.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEvents implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly eventService = inject(EventService);
  private readonly userService = inject(UserService);

  public readonly events = this.eventService.events;
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);

  public readonly availableOperators = signal<readonly AdminUser[]>([]);
  public readonly selectedOperators = signal<Set<string>>(new Set());

  public readonly statusFilter = signal<EventStatus | 'all'>('all');
  public readonly creating = signal(false);
  public readonly busy = signal(false);
  public readonly formError = signal<string | null>(null);

  public readonly statuses: (EventStatus | 'all')[] = ['all', 'active', 'paused', 'closed'];
  public readonly chipClass = EVENT_STATUS_CHIP;
  public readonly skeletons = Array.from({ length: 5 }, (_, i) => i);

  public readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    type: ['funeral' as EventType, Validators.required],
    date: ['', Validators.required],
    hostName: ['', [Validators.required, Validators.maxLength(120)]],
    venue: ['', Validators.maxLength(160)],
  });

  public readonly visible = computed(() => {
    const f = this.statusFilter();
    return f === 'all' ? this.events() : this.events().filter((e) => e.status === f);
  });

  public readonly isEmpty = computed(() => !this.loading() && this.visible().length === 0);

  ngOnInit(): void {
    this.loadEvents();
    this.loadOperators();
  }

  async loadEvents(): Promise<void> {
    this.loading.set(true);
    try {
      await this.eventService.loadEvents();
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Failed to load events');
    } finally {
      this.loading.set(false);
    }
  }

  /** Non-critical for this page — a failed load just leaves the create dialog's operator
   *  list empty rather than blocking anything else here. */
  async loadOperators(): Promise<void> {
    try {
      const users = await this.userService.listUsers();
      this.availableOperators.set(users.filter((u) => u.role === 'operator' && u.active));
    } catch {
      this.availableOperators.set([]);
    }
  }

  /** Donation totals need Epic 3's Donation collection, which doesn't exist yet. */
  public totalLabel(_e: Event): string {
    return '—';
  }

  public codeLabel(e: Event): string {
    if (e.status === 'closed' && e.accessCode) return 'released';
    return e.accessCode ?? '—';
  }

  public assignedLabel(e: Event): string {
    return `${e.assignedUserIds.length} assigned`;
  }

  public actionLabel(e: Event): string {
    switch (e.status) {
      case 'paused': return 'Resume';
      case 'closed': return 'Export';
      default: return 'Manage';
    }
  }

  public statusLabel(status: EventStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  public setStatus(s: EventStatus | 'all'): void { this.statusFilter.set(s); }

  public openCreate(): void {
    this.creating.set(true);
    this.formError.set(null);
    this.selectedOperators.set(new Set());
    this.form.reset({ type: 'funeral' });
  }

  public closeCreate(): void { this.creating.set(false); }

  public toggleOperator(id: string): void {
    this.selectedOperators.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  public isSelected(id: string): boolean {
    return this.selectedOperators().has(id);
  }

  public async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.formError.set(null);
    const { name, type, date, hostName, venue } = this.form.getRawValue();

    let event: Event;
    try {
      event = await this.eventService.createEvent({
        name,
        type,
        date,
        hostName,
        venue: venue || undefined,
      });
    } catch (err) {
      this.formError.set(err instanceof ServiceError ? err.message : 'Failed to create event');
      this.busy.set(false);
      return;
    }

    // The event now exists — close the dialog unconditionally from here. Keeping it open
    // (e.g. if the assignment call below fails) would risk a second "Create event" click
    // creating a duplicate against the same submitted form values.
    this.busy.set(false);
    this.closeCreate();

    const selected = [...this.selectedOperators()];
    if (selected.length > 0) {
      try {
        await this.eventService.assignOperators(event.id, selected);
      } catch (err) {
        // The event itself was created successfully — say so, rather than implying nothing
        // happened. Reuses the page-level error banner since the dialog is already closed.
        this.loadError.set(
          `"${event.name}" was created, but operator assignment failed: ${
            err instanceof ServiceError ? err.message : 'unknown error'
          }. Assign them from the event's detail page instead.`,
        );
      }
    }
  }

  public invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
