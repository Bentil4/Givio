import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ConnectionBanner, ConnectionState } from '../../../components/connection-banner/connection-banner';
import { DonationForm } from '../../../components/donation-form/donation-form';
import { PendingQueue } from '../../../components/pending-queue/pending-queue';
import { DonationRow } from '../../../components/donation-row/donation-row';
import { Donation, DonationDraft, formatCedis, formatCedisShort, totalMinor } from '../../../../data/models/donation';
import { DonationEvent, blockedReason, canRecordInto } from '../../../../data/models/donation-event';

type Phase = 'entry' | 'confirming' | 'saved';

/**
 * The operator's donation desk. Online and offline are the SAME screen — one form, one
 * flow, one set of muscle memory. Only the header total's label, the banner and the save
 * button's wording change. Two separate offline screens would mean an operator learning
 * the app twice, at the worst possible moment to be learning anything.
 *
 * Wire the three injected services listed in the handoff README (DonationService,
 * OfflineQueue, EventService); the signals below stand in for them.
 */
@Component({
  selector: 'app-donation-entry',
  imports: [MatIconModule, ConnectionBanner, DonationForm, PendingQueue, DonationRow],
  templateUrl: './donation-entry.html',
  styleUrl: './donation-entry.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationEntry {
  // ── replace with service-backed signals ──────────────────────────────
  public readonly event = signal<DonationEvent | null>(null);
  public readonly donations = signal<readonly Donation[]>([]);
  public readonly pending = signal<readonly DonationDraft[]>([]);
  public readonly online = signal(true);
  public readonly syncing = signal(false);
  public readonly syncedCount = signal(0);
  // ─────────────────────────────────────────────────────────────────────

  public readonly phase = signal<Phase>('entry');
  public readonly queueOpen = signal(false);
  public readonly draft = signal<DonationDraft | null>(null);
  public readonly lastSaved = signal<Donation | null>(null);
  public readonly busy = signal(false);

  public readonly canRecord = computed(() => canRecordInto(this.event()));
  public readonly blocked = computed(() => blockedReason(this.event()));

  public readonly connection = computed<ConnectionState>(() => {
    if (!this.online()) return 'offline';
    if (this.syncing()) return 'syncing';
    if (this.syncedCount() > 0 && this.pending().length === 0) return 'synced';
    return 'online';
  });

  /** Offline, the number on screen is by definition stale — so it says so. */
  public readonly totalLabel = computed(() => formatCedisShort(totalMinor(this.donations())));
  public readonly totalCaption = computed(() => (this.online() ? 'Live total' : 'Last known total'));

  public readonly myEntries = computed(() => this.donations().slice(0, 8));
  public readonly myCount = computed(() => this.donations().length);
  public readonly myTotalLabel = computed(() => formatCedis(totalMinor(this.donations())));

  public readonly confirmRows = computed(() => {
    const d = this.draft();
    if (!d) return [];
    return [
      { label: 'Donor', value: d.donorName, emphasis: false },
      { label: 'Amount', value: formatCedis(d.amountMinor), emphasis: true },
      { label: 'Type', value: d.donationType.replace('_', ' '), emphasis: false },
      { label: 'On behalf of', value: d.onBehalfOf || '—', emphasis: false },
    ];
  });

  /** A read-back step. The cheapest possible place to catch a wrong amount. */
  public onSubmitted(draft: DonationDraft): void {
    this.draft.set(draft);
    this.phase.set('confirming');
  }

  public backToEdit(): void {
    this.phase.set('entry');
  }

  public async confirm(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;

    this.busy.set(true);
    try {
      // if (this.online()) { saved = await donationService.create(draft); }
      // else { await offlineQueue.enqueue(draft); }
      this.phase.set('saved');
    } finally {
      this.busy.set(false);
    }
  }

  public nextDonation(): void {
    this.draft.set(null);
    this.lastSaved.set(null);
    this.phase.set('entry');
  }

  public openQueue(): void { this.queueOpen.set(true); }
  public closeQueue(): void { this.queueOpen.set(false); }
}
