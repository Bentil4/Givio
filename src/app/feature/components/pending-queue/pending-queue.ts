import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DonationDraft, DONATION_TYPE_LABELS } from '../../../data/models/donation';
import { formatCedis } from '../../../utils/donation.util';

/**
 * The queued-offline drawer. Everything an operator has recorded without a connection is
 * listed, counted and summed — a hidden queue is what makes people stop trusting an
 * offline-first app and start writing amounts on paper as a backup.
 */
@Component({
  selector: 'app-pending-queue',
  imports: [MatIconModule],
  templateUrl: './pending-queue.html',
  styleUrl: './pending-queue.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingQueue {
  public drafts = input.required<readonly DonationDraft[]>();
  /** Records the server definitively refused — never retried, never counted as pending. */
  public rejected = input<readonly DonationDraft[]>([]);
  public online = input(false);
  public syncing = input(false);

  public closed = output<void>();
  public edit = output<DonationDraft>();
  public discard = output<DonationDraft>();
  public syncNow = output<void>();
  public dismiss = output<DonationDraft>();

  /** The rejected record whose "Dismiss" is awaiting confirmation. */
  public readonly confirmingDismiss = signal<string | null>(null);
  private readonly keepButton = viewChild<ElementRef<HTMLButtonElement>>('keepButton');

  public readonly labels = DONATION_TYPE_LABELS;

  public totalLabel = computed(() =>
    formatCedis(this.drafts().reduce((sum, d) => sum + (d.amountMinor ?? 0), 0)),
  );

  constructor() {
    // Moving focus onto the safe choice keeps a keyboard user's next Enter from removing it.
    effect(() => this.keepButton()?.nativeElement.focus());
  }

  public askDismiss(draft: DonationDraft): void {
    this.confirmingDismiss.set(draft.localId);
  }

  public cancelDismiss(): void {
    this.confirmingDismiss.set(null);
  }

  public confirmDismiss(draft: DonationDraft): void {
    this.confirmingDismiss.set(null);
    this.dismiss.emit(draft);
  }

  public amountLabel(draft: DonationDraft): string {
    return formatCedis(draft.amountMinor);
  }

  public queuedAgo(draft: DonationDraft): string {
    if (!draft.queuedAt) return 'just now';
    const mins = Math.floor((Date.now() - new Date(draft.queuedAt).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`;
  }
}
