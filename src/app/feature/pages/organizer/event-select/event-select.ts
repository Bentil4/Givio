import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { EventService } from '../../../../data/services/event.service';
import { AuthService } from '../../../../data/services/auth.service';
import { ServiceError } from '../../../../data/services/service-error';
import type { Event, EventStatus } from '../../../../data/models/event';
import { EVENT_STATUS_CHIP } from '../../../../data/models/event';

/**
 * Operator event selection. Only events whose `assignedUserIds` includes this operator appear
 * — filtered client-side against the already-local (Dexie) event list, same as the rest of
 * EventService's Story 2.1/2.3 Dexie-only pattern; there's no server-scoped query yet.
 *
 * A paused or closed event is shown rather than hidden, dimmed and with its reason available
 * on tap. "My event has vanished" is a worse experience than "my event is paused", and the
 * operator can then tell the family something true.
 */
@Component({
  selector: 'app-event-select',
  imports: [MatIconModule],
  templateUrl: './event-select.html',
  styleUrl: './event-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventSelect implements OnInit {
  private readonly router = inject(Router);
  private readonly eventService = inject(EventService);
  private readonly authService = inject(AuthService);

  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly refreshing = signal(false);
  public readonly notice = signal<string | null>(null);

  // Real online/reachability detection doesn't exist anywhere in this app yet (Story 3.5's
  // SyncEngine owns that judgement) — donation-entry/mobile-entry stub it the same way.
  public readonly online = signal(true);

  public readonly chipClass = EVENT_STATUS_CHIP;
  public readonly skeletons = Array.from({ length: 3 }, (_, i) => i);

  public readonly events = computed(() => {
    const userId = this.authService.currentUser()?.$id;
    if (!userId) return [];
    return this.eventService.events().filter((e) => e.assignedUserIds.includes(userId));
  });

  public readonly isEmpty = computed(() => !this.loading() && this.events().length === 0);

  public readonly heading = computed(() => {
    const n = this.events().length;
    if (n === 0) return 'No events assigned yet';
    return n === 1 ? "You're assigned to 1 event" : `You're assigned to ${n} events`;
  });

  ngOnInit(): void {
    this.refresh();
  }

  public statusLabel(status: EventStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  public canOpen(e: Event): boolean {
    return e.status === 'active';
  }

  public ctaLabel(e: Event): string {
    switch (e.status) {
      case 'active':
        return 'Open desk';
      case 'paused':
        return 'Paused';
      case 'closed':
        return 'View only';
    }
  }

  public blockedReason(e: Event): string {
    switch (e.status) {
      case 'paused':
        return 'Giving is paused for this event. An Admin must resume it before you can record.';
      case 'closed':
        return 'This event is closed. Its records are read-only.';
      default:
        return '';
    }
  }

  public metaLabel(e: Event): string {
    const parts: string[] = [];
    if (e.venue) parts.push(e.venue);
    parts.push(e.date);
    return parts.join(' · ');
  }

  public select(e: Event): void {
    if (this.canOpen(e)) {
      this.router.navigate(['/organizer/entry'], { queryParams: { event: e.id } });
      return;
    }
    // Explaining the block beats a dead tap — and names who can unblock it.
    this.notice.set(this.blockedReason(e));
    setTimeout(() => this.notice.set(null), 5000);
  }

  public async refresh(): Promise<void> {
    this.loading.set(true);
    this.refreshing.set(true);
    try {
      await this.eventService.loadEvents();
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Failed to load events');
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }
}
