import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DonationEvent, EVENT_STATUS_CHIP } from '../../../../data/models/event';
import { formatCedisShort } from '../../../../data/models/donation';

type Confirmable = 'pause' | 'resume' | 'close' | 'regenerate' | null;

/**
 * One event: its code, its operator roster, and its irreversible actions.
 *
 * Pause, close and regenerate are deliberately NOT one-click. Closing invalidates the family
 * code and locks every record; regenerating signs out every family member mid-service. Each
 * confirmation names the consequence in real numbers rather than asking "are you sure?".
 */
@Component({
  selector: 'app-admin-event-detail',
  imports: [MatIconModule],
  templateUrl: './admin-event-detail.html',
  styleUrl: './admin-event-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEventDetail {
  // ── replace with service-backed signals ──────────────────────────────
  public readonly event = signal<DonationEvent | null>(null);
  public readonly loading = signal(true);
  public readonly familyViewerCount = signal(0);
  // ─────────────────────────────────────────────────────────────────────

  public readonly confirming = signal<Confirmable>(null);
  public readonly busy = signal(false);
  public readonly copied = signal(false);

  public readonly chipClass = EVENT_STATUS_CHIP;

  public readonly totalLabel = computed(() => {
    const e = this.event();
    return e ? formatCedisShort(e.totalMinor) : '\u2014';
  });

  public readonly statusLabel = computed(() => {
    const s = this.event()?.status;
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  });

  public readonly canPause = computed(() => this.event()?.status === 'live');
  public readonly canResume = computed(() => this.event()?.status === 'paused');
  public readonly isClosed = computed(() => this.event()?.status === 'closed');
  public readonly hasCode = computed(() => !!this.event()?.familyCode && !this.isClosed());

  public readonly confirmCopy = computed(() => {
    const e = this.event();
    const donors = e?.donorCount ?? 0;
    const viewers = this.familyViewerCount();

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
          body: `This locks all ${donors} donations, invalidates the family code, and archives the `
            + 'record. It cannot be reopened — only an export remains.',
          cta: 'Close and archive',
          danger: true,
        };
      case 'regenerate':
        return {
          title: 'Regenerate the family code?',
          body: `The current code stops working immediately and ${viewers} `
            + `${viewers === 1 ? 'family member' : 'family members'} will be signed out. You will `
            + 'need to share the new code with everyone again.',
          cta: 'Regenerate code',
          danger: true,
        };
      default:
        return null;
    }
  });

  public ask(action: Confirmable): void { this.confirming.set(action); }
  public dismiss(): void { this.confirming.set(null); }

  public async confirm(): Promise<void> {
    this.busy.set(true);
    try {
      // switch (this.confirming()) { case 'pause': await eventService.pause(id); … }
      this.dismiss();
    } finally {
      this.busy.set(false);
    }
  }

  public async copyCode(): Promise<void> {
    const code = this.event()?.familyCode;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
