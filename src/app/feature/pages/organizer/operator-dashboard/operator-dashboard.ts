import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventService } from '../../../../data/services/event.service';
import { AuthService } from '../../../../data/services/auth.service';
import { ServiceError } from '../../../../data/services/service-error';
import type { Event, EventStatus } from '../../../../data/models/event';
import { EVENT_STATUS_CHIP } from '../../../../data/models/event';

/**
 * Operator overview — "what am I assigned to, at a glance" before diving into My Events or
 * Donations. Assigned-event count/list is real (EventService, filtered by assignedUserIds,
 * same as event-select); donation stats are honest placeholders, not fabricated numbers —
 * Epic 3's Donation collection doesn't exist yet, matching AdminDashboard's own precedent
 * for the identical gap.
 */
@Component({
  selector: 'app-operator-dashboard',
  imports: [RouterLink],
  templateUrl: './operator-dashboard.html',
  styleUrl: './operator-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperatorDashboard implements OnInit {
  private readonly eventService = inject(EventService);
  private readonly authService = inject(AuthService);

  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);

  public readonly chipClass = EVENT_STATUS_CHIP;

  public readonly assignedEvents = computed(() => {
    const userId = this.authService.currentUser()?.$id;
    if (!userId) return [];
    return this.eventService.events().filter((e) => e.assignedUserIds.includes(userId));
  });

  /** A glance, not the full list — /organizer/events is the full picker. */
  public readonly previewEvents = computed(() => this.assignedEvents().slice(0, 3));

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
