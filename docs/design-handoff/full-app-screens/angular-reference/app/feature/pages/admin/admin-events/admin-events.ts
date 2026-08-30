import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { DonationEvent, EventStatus, EVENT_STATUS_CHIP, Occasion } from '../../../../data/models/event';
import { formatCedis } from '../../../../data/models/donation';

/**
 * Event management. Status is the gate on everything downstream, so the table leads with it
 * and every row's action names the outcome:
 *   draft  -> set up (assign operators, issue the family code)
 *   live   -> manage / pause
 *   paused -> resume
 *   closed -> export only
 */
@Component({
  selector: 'app-admin-events',
  imports: [MatIconModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-events.html',
  styleUrl: './admin-events.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEvents {
  private readonly fb = inject(FormBuilder);

  // ── replace with service-backed signals ──────────────────────────────
  public readonly events = signal<readonly DonationEvent[]>([]);
  public readonly availableOperators = signal<readonly { id: string; name: string }[]>([]);
  public readonly loading = signal(true);
  // ─────────────────────────────────────────────────────────────────────

  public readonly statusFilter = signal<EventStatus | 'all'>('all');
  public readonly creating = signal(false);
  public readonly busy = signal(false);
  public readonly selectedOperators = signal<Set<string>>(new Set());

  public readonly statuses: (EventStatus | 'all')[] = ['all', 'live', 'paused', 'draft', 'closed'];
  public readonly chipClass = EVENT_STATUS_CHIP;
  public readonly skeletons = Array.from({ length: 5 }, (_, i) => i);

  public readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    occasion: ['funeral' as Occasion, Validators.required],
    eventDate: ['', Validators.required],
    venue: ['', Validators.maxLength(160)],
  });

  public readonly visible = computed(() => {
    const f = this.statusFilter();
    return f === 'all' ? this.events() : this.events().filter((e) => e.status === f);
  });

  public readonly isEmpty = computed(() => !this.loading() && this.visible().length === 0);

  public totalLabel(e: DonationEvent): string {
    return e.totalMinor > 0 ? formatCedis(e.totalMinor) : '\u2014';
  }

  public codeLabel(e: DonationEvent): string {
    if (e.status === 'draft') return 'not issued';
    if (e.status === 'closed') return 'released';
    return e.familyCode ?? '\u2014';
  }

  public actionLabel(e: DonationEvent): string {
    switch (e.status) {
      case 'draft': return 'Set up';
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
    this.selectedOperators.set(new Set());
    this.form.reset({ occasion: 'funeral' });
  }

  public closeCreate(): void { this.creating.set(false); }

  public toggleOperator(id: string): void {
    this.selectedOperators.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  public isSelected(id: string): boolean { return this.selectedOperators().has(id); }

  public async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    try {
      // await eventService.create({ ...this.form.getRawValue(), operatorIds: [...this.selectedOperators()] });
      // The family code is generated server-side on save so two Admins cannot mint the same one.
      this.closeCreate();
    } finally {
      this.busy.set(false);
    }
  }

  public invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
