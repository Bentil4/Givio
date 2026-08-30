import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { inject } from '@angular/core';
import { DonationEvent, EVENT_STATUS_CHIP, blockedReason, canRecordInto } from '../../../../data/models/event';
import { formatCedisShort } from '../../../../data/models/donation';

/**
 * Operator event selection. Only events an Admin assigned to this operator appear — the list
 * is scoped server-side, not filtered here.
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
export class EventSelect {
  private readonly router = inject(Router);

  // ── replace with service-backed signals ──────────────────────────────
  public readonly events = signal<readonly DonationEvent[]>([]);
  public readonly loading = signal(true);
  public readonly operatorName = signal('');
  public readonly online = signal(true);
  // ─────────────────────────────────────────────────────────────────────

  public readonly refreshing = signal(false);
  public readonly notice = signal<string | null>(null);

  public readonly chipClass = EVENT_STATUS_CHIP;
  public readonly skeletons = Array.from({ length: 3 }, (_, i) => i);

  public readonly isEmpty = computed(() => !this.loading() && this.events().length === 0);

  public readonly heading = computed(() => {
    const n = this.events().length;
    if (n === 0) return 'No events assigned yet';
    return n === 1 ? "You're assigned to 1 event" : `You're assigned to ${n} events`;
  });

  public totalLabel(e: DonationEvent): string {
    return e.totalMinor > 0 ? formatCedisShort(e.totalMinor) : 'GH\u20B5 0';
  }

  public statusLabel(e: DonationEvent): string {
    return e.status.charAt(0).toUpperCase() + e.status.slice(1);
  }

  public canOpen(e: DonationEvent): boolean { return canRecordInto(e); }

  public ctaLabel(e: DonationEvent): string {
    switch (e.status) {
      case 'live': return 'Open desk';
      case 'paused': return 'Paused';
      case 'closed': return 'View only';
      default: return 'Not open';
    }
  }

  public metaLabel(e: DonationEvent): string {
    const parts: string[] = [];
    if (e.venue) parts.push(e.venue);
    parts.push(e.eventDate);
    const ops = e.operators.length;
    parts.push(ops === 1 ? '1 operator' : `${ops} operators`);
    return parts.join(' · ');
  }

  public select(e: DonationEvent): void {
    if (this.canOpen(e)) {
      this.router.navigate(['/organizer/entry'], { queryParams: { event: e.id } });
      return;
    }
    // Explaining the block beats a dead tap — and names who can unblock it.
    this.notice.set(blockedReason(e));
    setTimeout(() => this.notice.set(null), 5000);
  }

  public async refresh(): Promise<void> {
    this.refreshing.set(true);
    try {
      // await eventService.reloadAssigned();
    } finally {
      this.refreshing.set(false);
    }
  }
}
