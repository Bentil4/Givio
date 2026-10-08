import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  ConnectionBanner,
  ConnectionState,
} from '../../../components/connection-banner/connection-banner';
import { DonationForm } from '../../../components/donation-form/donation-form';
import { PendingQueue } from '../../../components/pending-queue/pending-queue';
import { DonationRow } from '../../../components/donation-row/donation-row';
import { Donation, DonationDraft } from '../../../../data/models/donation';
import { formatCedis, formatCedisShort, totalMinor } from '../../../../utils/donation.util';
import type { EventStatus } from '../../../../data/models/event';
import { appDb } from '../../../../data/dexie/app-db';
import type { OutboxEntry } from '../../../../data/models/outbox-entry';
import { DonationService } from '../../../../data/services/donation.service';
import { AuthService } from '../../../../data/services/auth.service';
import { ConnectivityService } from '../../../../core/services/connectivity.service';
import { SyncEngineService } from '../../../../data/services/sync-engine.service';
import { ReceiptService } from '../../../../data/services/receipt.service';
import { ServiceError } from '../../../../core/services/service-error';
import { OperatorEventContext } from '../operator-event-context';

/** A queued donation-create outbox entry, shaped for the PendingQueue drawer. */
function draftFromOutboxEntry(entry: OutboxEntry): DonationDraft {
  const donation = entry.payload as Donation;
  return {
    localId: String(entry.localId),
    eventId: donation.eventId,
    donorName: donation.donorName,
    amountMinor: donation.amountMinor,
    donationType: donation.donationType,
    onBehalfOf: donation.onBehalfOf,
    donorPhone: donation.donorPhone,
    notes: donation.notes,
    queuedAt: entry.createdAt,
    receiptNumber: donation.receiptNumber,
    rejectionReason: entry.status === 'failed' ? entry.lastError : undefined,
  };
}

type Phase = 'entry' | 'confirming' | 'saved';

/**
 * The operator's donation desk. Online and offline are the SAME screen — one form, one
 * flow, one set of muscle memory. Only the header total's label, the banner and the save
 * button's wording change. Two separate offline screens would mean an operator learning
 * the app twice, at the worst possible moment to be learning anything.
 *
 * Story 6.6: the Event comes from OperatorEventContext (the layout's switcher, or the `event`
 * query param it picks up), never a fallback — with 2+ active Events and none picked, the form
 * stays usable and "Save donation" points the Operator at the switcher instead.
 *
 * Real (Story 3.1): event load (Dexie, by the `event` query param), donation list for this
 * event, createDonation itself (Dexie + outbox + inline Appwrite push, DonationService), and
 * `online` (real navigator.onLine detection, ConnectivityService). The header's "live total"
 * is this-device-only until a real cross-device pull exists — same limitation
 * EventDataService.listEvents() already carries. `syncing`/`pending`/`syncedCount` are now
 * real too (Story 3.5, SyncEngineService): pending is this event's own donation-create outbox
 * entries, refreshed after every save and whenever a drain finishes; syncedCount is a
 * transient "just synced N" count for the connection banner, self-clearing after 5s. The
 * 'saved' phase's Print/Download actions are real too (Story 3.6, ReceiptService): a
 * client-generated jsPDF receipt built from `lastSaved` exactly as it was returned — carrying
 * an AD-8 provisional receiptNumber offline, or the Function's canonical one online — with no
 * server round-trip either way.
 */
@Component({
  selector: 'app-donation-entry',
  imports: [MatIconModule, RouterLink, ConnectionBanner, DonationForm, PendingQueue, DonationRow],
  templateUrl: './donation-entry.html',
  styleUrl: './donation-entry.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationEntry {
  private readonly eventContext = inject(OperatorEventContext);
  private readonly donationService = inject(DonationService);
  private readonly authService = inject(AuthService);
  private readonly connectivityService = inject(ConnectivityService);
  private readonly syncEngine = inject(SyncEngineService);
  private readonly receiptService = inject(ReceiptService);

  public readonly event = this.eventContext.activeEvent;
  private readonly eventId = computed(() => this.event()?.id ?? null);
  public readonly notFound = this.eventContext.pickNotFound;
  public readonly loadError = signal<string | null>(null);
  /** Filtered by Event so an in-flight load for a previously-picked Event can never show
   *  under the current one. */
  public readonly donations = computed(() =>
    this.donationService.donations().filter((d) => d.eventId === this.eventId()),
  );

  public readonly needsPick = computed(() => this.eventContext.showSwitcher() && !this.event());
  public readonly noActiveEvent = computed(
    () =>
      this.eventContext.loaded() &&
      !this.event() &&
      !this.notFound() &&
      this.eventContext.activeEvents().length === 0,
  );

  public readonly heading = computed(() => {
    if (this.notFound()) return 'Event not found';
    const event = this.event();
    if (event) return event.name;
    if (!this.eventContext.loaded()) return 'Loading event…';
    return 'Record a donation';
  });

  public readonly online = this.connectivityService.online;
  public readonly syncing = this.syncEngine.syncing;
  public readonly syncedCount = signal(0);
  public readonly pending = signal<readonly DonationDraft[]>([]);
  /** Server-rejected creates: kept visible, but no longer pending. */
  public readonly rejected = signal<readonly DonationDraft[]>([]);
  private previousPendingCount = 0;

  public readonly phase = signal<Phase>('entry');
  public readonly queueOpen = signal(false);
  public readonly draft = signal<DonationDraft | null>(null);
  public readonly lastSaved = signal<Donation | null>(null);
  public readonly busy = signal(false);
  public readonly saveError = signal<string | null>(null);

  public readonly canRecord = computed(() => this.event()?.status === 'active');
  /** Unpicked is not blocked: Save stays enabled and explains itself (UX-DR6). */
  public readonly formBlocked = computed(
    () =>
      !this.eventContext.loaded() ||
      (!!this.event() && !this.canRecord()) ||
      this.noActiveEvent() ||
      this.notFound(),
  );

  public readonly blocked = computed(() => {
    const status = this.event()?.status;
    if (status === 'paused') {
      return "Giving is paused for this event. Ask your company's organizer to resume it.";
    }
    if (status === 'closed') {
      return 'This event is closed. Its records are read-only.';
    }
    return null;
  });

  public readonly connection = computed<ConnectionState>(() => {
    if (!this.online()) return 'offline';
    if (this.syncing()) return 'syncing';
    if (this.syncedCount() > 0 && this.pending().length === 0) return 'synced';
    return 'online';
  });

  /** Offline, the number on screen is by definition stale — so it says so. */
  public readonly totalLabel = computed(() => formatCedisShort(totalMinor(this.donations())));
  public readonly totalCaption = computed(() =>
    this.online() ? 'Live total' : 'Last known total',
  );

  public readonly eventMeta = computed(() => {
    const e = this.event();
    if (!e) {
      if (this.needsPick()) return 'Pick an Event above to start recording.';
      if (this.noActiveEvent()) return 'No active Event is assigned to you.';
      return '';
    }
    if (e.accessCode) return e.accessCode;
    return e.venue ? `${e.venue} · ${e.date}` : e.date;
  });

  /** Short, cosmetic label only — the real receiptNumber is assigned at save time. */
  public readonly eventCodeLabel = computed(() => {
    const e = this.event();
    if (!e) return '';
    return e.accessCode ?? e.id.slice(0, 6).toUpperCase();
  });

  private readonly myDonations = computed(() => {
    const userId = this.authService.currentUser()?.$id;
    return this.donations().filter((d) => d.recordedBy === userId);
  });

  public readonly myEntries = computed(() => this.myDonations().slice(0, 8));
  public readonly myCount = computed(() => this.myDonations().length);
  public readonly myTotalLabel = computed(() => formatCedis(totalMinor(this.myDonations())));

  constructor() {
    effect(() => {
      const eventId = this.eventId();
      untracked(() => void this.onEventChanged(eventId));
    });

    // Once a drain finishes (syncing flips back to false), re-read this event's pending
    // donations from the outbox — some of them may have just synced. If the pending count
    // for THIS event dropped to zero, show the transient "synced" banner state briefly.
    effect(() => {
      if (this.syncing()) return;
      void this.refreshPending().then(() => {
        const count = this.pending().length;
        if (this.previousPendingCount > 0 && count === 0) {
          this.syncedCount.set(this.previousPendingCount);
          setTimeout(() => this.syncedCount.set(0), 5000);
        }
        this.previousPendingCount = count;
      });
    });
  }

  /** A draft or saved receipt belongs to the Event it was made under — switching Events
   *  returns to a fresh entry rather than carrying either across. */
  private async onEventChanged(eventId: string | null): Promise<void> {
    if (this.phase() !== 'entry') {
      this.draft.set(null);
      this.lastSaved.set(null);
      this.saveError.set(null);
      this.phase.set('entry');
    }
    await this.refreshPending();
    if (!eventId) return;

    try {
      await this.donationService.loadDonationsForEvent(eventId);
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Failed to load donations');
    }
  }

  private async refreshPending(): Promise<void> {
    const eventId = this.eventId();
    if (!eventId) {
      this.pending.set([]);
      this.rejected.set([]);
      return;
    }
    const entries = await appDb.outbox
      .where('entityType')
      .equals('donation')
      .filter((e) => e.op === 'create' && (e.payload as Donation).eventId === eventId)
      .toArray();
    this.pending.set(entries.filter((e) => e.status !== 'failed').map(draftFromOutboxEntry));
    this.rejected.set(entries.filter((e) => e.status === 'failed').map(draftFromOutboxEntry));
  }

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

  public statusLabel(status: EventStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  /** A read-back step. The cheapest possible place to catch a wrong amount. */
  public onSubmitted(draft: DonationDraft): void {
    this.draft.set(draft);
    this.phase.set('confirming');
  }

  public onEventMissing(): void {
    if (this.needsPick()) this.eventContext.requestPick();
  }

  public backToEdit(): void {
    this.phase.set('entry');
  }

  public async confirm(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    // FR-3: the draft is saved to the Event it was read back under, or not at all.
    if (draft.eventId !== this.eventId()) {
      this.saveError.set(
        'This donation was started for a different Event than the one now picked. Go back and check it before saving.',
      );
      return;
    }

    this.busy.set(true);
    this.saveError.set(null);
    try {
      const saved = await this.donationService.createDonation(draft);
      // Switched mid-save: the donation is recorded against the Event it was read back under,
      // but its receipt must not be offered under the newly-picked one.
      if (saved.eventId !== this.eventId()) return;
      this.lastSaved.set(saved);
      this.phase.set('saved');
      await this.refreshPending();
    } catch (err) {
      this.saveError.set(err instanceof ServiceError ? err.message : 'Failed to save donation');
    } finally {
      this.busy.set(false);
    }
  }

  public nextDonation(): void {
    this.draft.set(null);
    this.lastSaved.set(null);
    this.phase.set('entry');
  }

  /**
   * Story 3.6: client-generated, fully offline-capable (no server round-trip) — works from the
   * `lastSaved` donation exactly as saved, whether its `receiptNumber` is still an AD-8
   * provisional number (offline) or already the Function's canonical one (online).
   */
  public downloadReceipt(): void {
    const donation = this.lastSaved();
    const event = this.event();
    if (!donation || !event) return;
    this.receiptService.downloadReceipt(donation, event, this.operatorName());
  }

  public printReceipt(): void {
    const donation = this.lastSaved();
    const event = this.event();
    if (!donation || !event) return;
    this.receiptService.printReceipt(donation, event, this.operatorName());
  }

  private operatorName(): string {
    return this.authService.currentUser()?.name ?? 'Operator';
  }

  public openQueue(): void {
    this.queueOpen.set(true);
  }
  public closeQueue(): void {
    this.queueOpen.set(false);
  }

  /** The pending-queue drawer's manual "Sync now" button (AC's "Retry Sync" option). */
  public syncNow(): void {
    void this.syncEngine.drainOutbox();
  }

  public async dismissRejected(draft: DonationDraft): Promise<void> {
    await this.syncEngine.dismissRejected(Number(draft.localId));
    await this.refreshPending();
    await this.donationService.loadDonationsForEvent(draft.eventId);
  }
}
