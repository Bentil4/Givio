import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import { ServiceError } from '../../../../../core/services/service-error';
import { DuplicateEventFlagDataService } from '../../../../../data/services/duplicate-event-flag-data.service';
import type {
  DuplicateEventFlag,
  DuplicateFlagDecision,
  DuplicateMatchField,
  FlaggedEvent,
} from '../../../../../data/models/duplicate-event-flag';

interface PendingDecision {
  readonly decision: DuplicateFlagDecision;
  readonly flag: DuplicateEventFlag;
}

interface RowError {
  readonly flagId: string;
  readonly message: string;
}

const DECISION_COPY: Record<DuplicateFlagDecision, { title: string; body: string; cta: string }> = {
  confirm: {
    title: 'Confirm these are the same event?',
    body:
      'The flag closes as a genuine duplicate. Neither event is changed — follow up with the ' +
      'companies involved; View event opens each one.',
    cta: 'Confirm duplicate',
  },
  clear: {
    title: 'Clear this flag?',
    body:
      'Use this for a false positive, such as a legitimate reschedule. These two events are ' +
      'never flagged together again.',
    cta: 'Clear flag',
  },
};

const ANNOUNCEMENTS: Record<DuplicateFlagDecision, string> = {
  confirm: 'Flag confirmed as a duplicate and closed.',
  clear: 'Flag cleared.',
};

const MATCH_LABELS: Record<DuplicateMatchField, string> = {
  name: 'event name',
  hostName: 'host',
};

function errorMessage(err: unknown): string {
  return err instanceof ServiceError ? err.message : 'Failed to save your decision';
}

/**
 * Story 7.4 (FR-14): the Approvals screen's "Duplicate events" tab — pairs of Events from
 * different owners that look like the same occasion, raised by the Function when the newer
 * one was created (it never blocks that creation). The queue is loaded by the parent, which
 * also shows its count; each decision is confirmed, sent to the Function, then re-read.
 */
@Component({
  selector: 'app-duplicate-events',
  imports: [MatIconModule, DatePipe, CdkTrapFocus],
  templateUrl: './duplicate-events.html',
  styleUrl: './duplicate-events.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DuplicateEvents {
  private readonly flagData = inject(DuplicateEventFlagDataService);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('duplicatesHeading');

  public readonly flags = input.required<readonly DuplicateEventFlag[]>();
  public readonly loading = input(false);
  public readonly loadError = input<string | null>(null);
  public readonly changed = output<void>();
  public readonly retry = output<void>();

  public readonly pending = signal<PendingDecision | null>(null);
  public readonly decidingId = signal<string | null>(null);
  public readonly rowError = signal<RowError | null>(null);
  public readonly announcement = signal('');
  public readonly skeletons = [0, 1];

  public readonly pendingCopy = computed(() => {
    const p = this.pending();
    return p ? DECISION_COPY[p.decision] : null;
  });

  public matchSummary(flag: DuplicateEventFlag): string {
    return flag.matchedOn.map((field) => MATCH_LABELS[field]).join(' and ');
  }

  public ownerName(event: FlaggedEvent): string {
    return event.tenantId ? (event.tenantName ?? event.tenantId) : 'Created by Admin';
  }

  public rowErrorFor(flag: DuplicateEventFlag): string | null {
    const e = this.rowError();
    return e?.flagId === flag.flagId ? e.message : null;
  }

  public ask(decision: DuplicateFlagDecision, flag: DuplicateEventFlag): void {
    this.rowError.set(null);
    this.pending.set({ decision, flag });
  }

  public dismissPending(): void {
    if (this.decidingId() === null) {
      this.pending.set(null);
    }
  }

  public async confirmPending(): Promise<void> {
    const p = this.pending();
    if (!p) return;
    await this.decide(p.flag, p.decision);
    this.pending.set(null);
  }

  private async decide(flag: DuplicateEventFlag, decision: DuplicateFlagDecision): Promise<void> {
    this.decidingId.set(flag.flagId);
    try {
      await this.flagData.resolveDuplicateEventFlag(flag.flagId, decision);
      this.announcement.set(ANNOUNCEMENTS[decision]);
      this.changed.emit();
      afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    } catch (err) {
      this.rowError.set({ flagId: flag.flagId, message: errorMessage(err) });
    } finally {
      this.decidingId.set(null);
    }
  }
}
