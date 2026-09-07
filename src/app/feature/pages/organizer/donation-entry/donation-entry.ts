import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  ConnectionBanner,
  ConnectionState,
} from '../../../components/connection-banner/connection-banner';
import { DonationForm } from '../../../components/donation-form/donation-form';
import { PendingQueue } from '../../../components/pending-queue/pending-queue';
import { DonationRow } from '../../../components/donation-row/donation-row';
import {
  Donation,
  DonationDraft,
  formatCedis,
  formatCedisShort,
  totalMinor,
} from '../../../../data/models/donation';
import type { Event, EventStatus } from '../../../../data/models/event';
import { appDb } from '../../../../data/dexie/app-db';
import type { OutboxEntry } from '../../../../data/dexie/outbox-entry';
import { DonationService } from '../../../../data/services/donation.service';
import { AuthService } from '../../../../data/services/auth.service';
import { ConnectivityService } from '../../../../data/services/connectivity.service';
import { SyncEngineService } from '../../../../data/services/sync-engine.service';
import { ServiceError } from '../../../../data/services/service-error';

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
    attempts: entry.retries,
  };
}

type Phase = 'entry' | 'confirming' | 'saved';

/**
 * The operator's donation desk. Online and offline are the SAME screen — one form, one
 * flow, one set of muscle memory. Only the header total's label, the banner and the save
 * button's wording change. Two separate offline screens would mean an operator learning
 * the app twice, at the worst possible moment to be learning anything.
 *
 * Real (Story 3.1): event load (Dexie, by the `event` query param), donation list for this
 * event, createDonation itself (Dexie + outbox + inline Appwrite push, DonationService), and
 * `online` (real navigator.onLine detection, ConnectivityService). The header's "live total"
 * is this-device-only until a real cross-device pull exists — same limitation
 * EventDataService.listEvents() already carries. `syncing`/`pending`/`syncedCount` are now
 * real too (Story 3.5, SyncEngineService): pending is this event's own donation-create outbox
 * entries, refreshed after every save and whenever a drain finishes; syncedCount is a
 * transient "just synced N" count for the connection banner, self-clearing after 5s.
 */
@Component({
  selector: 'app-donation-entry',
  imports: [MatIconModule, RouterLink, ConnectionBanner, DonationForm, PendingQueue, DonationRow],
  templateUrl: './donation-entry.html',
  styleUrl: './donation-entry.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationEntry implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly donationService = inject(DonationService);
  private readonly authService = inject(AuthService);
  private readonly connectivityService = inject(ConnectivityService);
  private readonly syncEngine = inject(SyncEngineService);

  public readonly event = signal<Event | null>(null);
  public readonly notFound = signal(false);
  public readonly loadError = signal<string | null>(null);
  public readonly donations = this.donationService.donations;

  public readonly online = this.connectivityService.online;
  public readonly syncing = this.syncEngine.syncing;
  public readonly syncedCount = signal(0);
  public readonly pending = signal<readonly DonationDraft[]>([]);
  private previousPendingCount = 0;

  public readonly phase = signal<Phase>('entry');
  public readonly queueOpen = signal(false);
  public readonly draft = signal<DonationDraft | null>(null);
  public readonly lastSaved = signal<Donation | null>(null);
  public readonly busy = signal(false);
  public readonly saveError = signal<string | null>(null);

  public readonly canRecord = computed(() => this.event()?.status === 'active');

  public readonly blocked = computed(() => {
    const status = this.event()?.status;
    if (status === 'paused') {
      return 'Giving is paused for this event. An Admin must resume it before you can record.';
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
    if (!e) return '';
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

  private async refreshPending(): Promise<void> {
    const eventId = this.event()?.id;
    if (!eventId) {
      this.pending.set([]);
      return;
    }
    const entries = await appDb.outbox
      .where('entityType')
      .equals('donation')
      .filter((e) => e.op === 'create' && (e.payload as Donation).eventId === eventId)
      .toArray();
    this.pending.set(entries.map(draftFromOutboxEntry));
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

  async ngOnInit(): Promise<void> {
    const eventId = this.route.snapshot.queryParamMap.get('event');
    if (!eventId) {
      this.notFound.set(true);
      return;
    }

    const event = await appDb.events.get(eventId);
    if (!event) {
      this.notFound.set(true);
      return;
    }

    this.event.set(event);
    await this.refreshPending();

    try {
      await this.donationService.loadDonationsForEvent(eventId);
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Failed to load donations');
    }
  }

  public statusLabel(status: EventStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

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
    this.saveError.set(null);
    try {
      const saved = await this.donationService.createDonation(draft);
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
}
