import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { Donation, DonationDraft, DonationType, formatCedisShort, totalMinor } from '../../../../data/models/donation';
import type { Event } from '../../../../data/models/event';
import { appDb } from '../../../../data/dexie/app-db';
import { ConnectivityService } from '../../../../data/services/connectivity.service';
import { DonationService } from '../../../../data/services/donation.service';
import { SyncEngineService } from '../../../../data/services/sync-engine.service';
import { ServiceError } from '../../../../data/services/service-error';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

/**
 * Phone-sized entry for roaming collectors.
 *
 * At Ghanaian funerals collectors move through the crowd rather than sitting at a desk, so
 * this is not a responsive squeeze of the tablet form — it is a different ergonomic:
 *
 *   - Amount at the top, where the eye lands and the thumb never has to reach.
 *   - A custom keypad in the bottom third. The native numeric keyboard would cover the
 *     amount it is editing, and switching between text and number modes for name-then-amount
 *     costs a second every donor.
 *   - 52px keys and a 54px save target — usable while standing, one-handed, in a crowd.
 *   - The live event total stays pinned in the header, because "how much so far?" is the
 *     question a collector is asked constantly and should never leave the form to answer.
 *
 * Same real wiring as donation-entry.ts (event load by the `event` query param,
 * DonationService.createDonation, ConnectivityService, SyncEngineService for the pending
 * count) — just the phone-sized keypad UI instead of the full desk form.
 */
@Component({
  selector: 'app-mobile-entry',
  imports: [MatIconModule],
  templateUrl: './mobile-entry.html',
  styleUrl: './mobile-entry.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileEntry implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly connectivityService = inject(ConnectivityService);
  private readonly donationService = inject(DonationService);
  private readonly syncEngine = inject(SyncEngineService);

  public readonly event = signal<Event | null>(null);
  public readonly notFound = signal(false);
  public readonly busy = signal(false);

  public readonly online = this.connectivityService.online;
  public readonly syncing = this.syncEngine.syncing;
  public readonly pendingCount = signal(0);

  public readonly eventId = computed(() => this.event()?.id ?? '');
  public readonly eventName = computed(() => {
    if (this.notFound()) return 'Event not found';
    return this.event()?.name ?? 'Loading event…';
  });
  public readonly eventTotalMinor = computed(() => totalMinor(this.donationService.donations()));

  public readonly donorName = signal('');
  public readonly amountText = signal('');
  public readonly donationType = signal<DonationType>('cash');
  public readonly touched = signal(false);

  public readonly keys = KEYS;
  public readonly types: DonationType[] = ['cash', 'mobile_money', 'in_kind'];

  /** Short labels only — three full names will not fit a 390px row legibly. */
  public readonly shortLabels: Record<DonationType, string> = {
    cash: 'Cash',
    mobile_money: 'MoMo',
    in_kind: 'In-Kind',
  };

  public readonly totalLabel = computed(() => formatCedisShort(this.eventTotalMinor()));
  public readonly totalCaption = computed(() => (this.online() ? 'Live total' : 'Last known'));

  public readonly amountDisplay = computed(() => this.amountText() || '0');
  public readonly amountRequired = computed(() => this.donationType() !== 'in_kind');

  private readonly amountValid = computed(() => {
    if (!this.amountRequired()) return true;
    const n = parseFloat(this.amountText());
    return !Number.isNaN(n) && n > 0;
  });

  private readonly nameValid = computed(() => this.donorName().trim().length >= 2);

  public readonly canSave = computed(() =>
    this.nameValid() && this.amountValid() && !this.busy() && !!this.eventId(),
  );

  public readonly hint = computed(() => {
    if (!this.touched()) return null;
    if (!this.nameValid()) return "Enter the donor's name.";
    if (!this.amountValid()) return 'Enter an amount greater than zero.';
    return null;
  });

  public readonly saveLabel = computed(() =>
    this.online() ? 'Save donation' : 'Save to this device',
  );

  public readonly saveError = signal<string | null>(null);

  constructor() {
    // Mirrors donation-entry.ts: once a drain finishes, re-read this event's pending
    // donation-create outbox entries \u2014 some of them may have just synced.
    effect(() => {
      if (this.syncing()) return;
      void this.refreshPending();
    });
  }

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
    } catch {
      // The header total is a nice-to-have here \u2014 a failed pull just leaves it at whatever
      // this device already had cached, same as donation-entry.ts's own fallback.
    }
  }

  private async refreshPending(): Promise<void> {
    const eventId = this.eventId();
    if (!eventId) {
      this.pendingCount.set(0);
      return;
    }
    const count = await appDb.outbox
      .where('entityType')
      .equals('donation')
      .filter((e) => e.op === 'create' && (e.payload as Donation).eventId === eventId)
      .count();
    this.pendingCount.set(count);
  }

  public keyLabel(key: string): string { return key === 'back' ? '\u232B' : key; }

  public press(key: string): void {
    this.touched.set(true);

    if (key === 'back') {
      this.amountText.update((v) => v.slice(0, -1));
      return;
    }

    this.amountText.update((v) => {
      // One decimal point, two decimal places — the constraint belongs in the input,
      // not in a validation message after the fact.
      if (key === '.') return v.includes('.') || v === '' ? v : v + '.';
      const next = v + key;
      const dot = next.indexOf('.');
      if (dot !== -1 && next.length - dot > 3) return v;
      if (dot === -1 && next.replace(/^0+/, '').length > 7) return v;
      return next.replace(/^0+(?=\d)/, '');
    });
  }

  public setName(value: string): void { this.donorName.set(value); }
  public setType(type: DonationType): void { this.donationType.set(type); }

  public draft(): DonationDraft | null {
    if (!this.canSave()) return null;
    return {
      localId: crypto.randomUUID(),
      eventId: this.eventId(),
      donorName: this.donorName().trim(),
      amountMinor: this.amountText() ? Math.round(parseFloat(this.amountText()) * 100) : null,
      donationType: this.donationType(),
    };
  }

  public async save(): Promise<void> {
    this.touched.set(true);
    const draft = this.draft();
    if (!draft) return;

    this.busy.set(true);
    this.saveError.set(null);
    try {
      // DonationService.createDonation handles both cases itself (Dexie + outbox, with an
      // inline sync attempt when online) — there's no separate offline path to branch on here.
      await this.donationService.createDonation(draft);
      await this.refreshPending();
      this.reset();
    } catch (err) {
      this.saveError.set(err instanceof ServiceError ? err.message : 'Failed to save donation');
    } finally {
      this.busy.set(false);
    }
  }

  /** Name and amount clear; the donation type persists — a desk rarely alternates. */
  private reset(): void {
    this.donorName.set('');
    this.amountText.set('');
    this.touched.set(false);
  }
}
