import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventService } from '../../../../data/services/event.service';
import { ServiceError } from '../../../../data/services/service-error';
import type { Event, EventStatus } from '../../../../data/models/event';
import { EVENT_STATUS_CHIP } from '../../../../data/models/event';

/**
 * Admin overview — "every live event, the running totals, and anything needing attention"
 * per the design handoff. The stat grid + Live events panel are real (EventService); Raised
 * today / Donors today / Awaiting sync / Live feed are honest placeholders, not fabricated
 * numbers — they need Epic 3's Donation collection and offline queue, neither of which
 * exists in this codebase yet. The design's yellow conflict-attention bar is omitted
 * entirely rather than shown as permanent dead UI, for the same reason (no conflict
 * detection exists yet either) — see docs/design-handoff/INTEGRATION-STATUS.md.
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboard implements OnInit {
  private readonly eventService = inject(EventService);

  public readonly events = this.eventService.events;
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);

  public readonly chipClass = EVENT_STATUS_CHIP;

  public readonly liveEventCount = computed(
    () => this.events().filter((e) => e.status === 'active').length,
  );

  /** A summary, not the full table — /dashboard/events is the full list. */
  public readonly dashboardEvents = computed(() => this.events().slice(0, 3));

  async ngOnInit(): Promise<void> {
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

  public eventMeta(e: Event): string {
    const type = e.type.charAt(0).toUpperCase() + e.type.slice(1);
    return e.venue ? `${type} · ${e.date} · ${e.venue}` : `${type} · ${e.date}`;
  }

  public statusLabel(status: EventStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
