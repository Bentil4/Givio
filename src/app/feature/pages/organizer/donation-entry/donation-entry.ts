import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ConnectionBanner, ConnectionState } from '../../../components/connection-banner/connection-banner';
import { DonationForm } from '../../../components/donation-form/donation-form';
import { PendingQueue } from '../../../components/pending-queue/pending-queue';
import { DonationRow } from '../../../components/donation-row/donation-row';
import { Donation, DonationDraft, formatCedis, formatCedisShort, totalMinor } from '../../../../data/models/donation';
import type { Event, EventStatus } from '../../../../data/models/event';
import { appDb } from '../../../../data/dexie/app-db';
import { DonationService } from '../../../../data/services/donation.service';
import { AuthService } from '../../../../data/services/auth.service';
import { ServiceError } from '../../../../data/services/service-error';

type Phase = 'entry' | 'confirming' | 'saved';

/**
 * The operator's donation desk. Online and offline are the SAME screen — one form, one
 * flow, one set of muscle memory. Only the header total's label, the banner and the save
 * button's wording change. Two separate offline screens would mean an operator learning
 * the app twice, at the worst possible moment to be learning anything.
 *
 * Real (Story 3.1): event load (Dexie, by the `event` query param), donation list for this
 * event, and createDonation itself (Dexie + outbox + inline Appwrite push, DonationService).
 * The header's "live total" is this-device-only until Story 3.5's SyncEngine adds a real
 * pull — same limitation EventDataService.listEvents() already carries. `online`/`syncing`/
 * `syncedCount` remain stand-in signals; the connection-banner's syncing/synced states and
 * the pending-queue drawer are Story 3.5's job, not this story's.
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

  public readonly event = signal<Event | null>(null);
  public readonly notFound = signal(false);
  public readonly loadError = signal<string | null>(null);
  public readonly donations = this.donationService.donations;

  // Real online/reachability detection doesn't exist anywhere in this app yet (Story 3.5's
  // SyncEngine owns that judgement) — event-select/mobile-entry stub it the same way.
  public readonly online = signal(true);
  public readonly syncing = signal(false);
  public readonly syncedCount = signal(0);
  public readonly pending = signal<readonly DonationDraft[]>([]);

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
  public readonly totalCaption = computed(() => (this.online() ? 'Live total' : 'Last known total'));

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

  public openQueue(): void { this.queueOpen.set(true); }
  public closeQueue(): void { this.queueOpen.set(false); }
}
