import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventService } from '../../../../data/services/event.service';
import { DonationService } from '../../../../data/services/donation.service';
import { ServiceError } from '../../../../data/services/service-error';
import type { Event, EventStatus } from '../../../../data/models/event';
import { EVENT_STATUS_CHIP } from '../../../../data/models/event';
import type { Donation } from '../../../../data/models/donation';
import { formatCedis, formatCedisShort, totalMinor } from '../../../../data/models/donation';

/**
 * Admin overview — "every live event, the running totals, and anything needing attention"
 * per the design handoff. Real (Story 4.1): stat grid (Live events real since Epic 2; Raised
 * today/Donors today/per-event totals/Live feed now real too, backed by DonationService),
 * updated automatically via DonationDataService's Realtime subscription — the first Realtime
 * use in the app, resolving the Architecture Spine's Deferred Realtime item. "Awaiting sync"
 * stays an honest placeholder: a server-only read can never see a donation that hasn't synced
 * yet by definition, so that count genuinely needs Story 3.5's SyncEngine, not just this data.
 * The design's yellow conflict-attention bar is likewise omitted — no conflict detection
 * exists yet either — see docs/design-handoff/INTEGRATION-STATUS.md.
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboard implements OnInit, OnDestroy {
  private readonly eventService = inject(EventService);
  private readonly donationService = inject(DonationService);
  private readonly todayKey = new Date().toISOString().slice(0, 10);
  private unsubscribeRealtime: (() => void) | null = null;

  public readonly events = this.eventService.events;
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);

  public readonly chipClass = EVENT_STATUS_CHIP;

  public readonly liveEventCount = computed(
    () => this.events().filter((e) => e.status === 'active').length,
  );

  /** A summary, not the full table — /dashboard/events is the full list. */
  public readonly dashboardEvents = computed(() => this.events().slice(0, 3));

  private readonly activeDonations = computed(() =>
    this.donationService.donations().filter((d) => !d.deletedAt && d.syncStatus !== 'conflict'),
  );

  private readonly todaysDonations = computed(() =>
    this.activeDonations().filter((d) => d.recordedAt.slice(0, 10) === this.todayKey),
  );

  public readonly raisedTodayLabel = computed(() => formatCedisShort(totalMinor(this.todaysDonations())));
  public readonly donorsToday = computed(() => this.todaysDonations().length);

  private readonly donationsByEvent = computed(() => {
    const map = new Map<string, Donation[]>();
    for (const d of this.activeDonations()) {
      const list = map.get(d.eventId);
      if (list) list.push(d);
      else map.set(d.eventId, [d]);
    }
    return map;
  });

  /** Most recent activity across every event — refreshes on the Realtime subscription. */
  public readonly liveFeed = computed(() =>
    [...this.activeDonations()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 6),
  );

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([this.eventService.loadEvents(), this.donationService.loadAllDonations()]);
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Failed to load events');
    } finally {
      this.loading.set(false);
    }

    this.unsubscribeRealtime = await this.donationService.subscribeToChanges(() => {
      void this.donationService.loadAllDonations();
    });
  }

  ngOnDestroy(): void {
    this.unsubscribeRealtime?.();
  }

  public eventMeta(e: Event): string {
    const type = e.type.charAt(0).toUpperCase() + e.type.slice(1);
    return e.venue ? `${type} · ${e.date} · ${e.venue}` : `${type} · ${e.date}`;
  }

  public statusLabel(status: EventStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  public eventTotalLabel(eventId: string): string {
    return formatCedis(totalMinor(this.donationsByEvent().get(eventId) ?? []));
  }

  public eventDonorCount(eventId: string): number {
    return (this.donationsByEvent().get(eventId) ?? []).length;
  }

  public feedAmountLabel(d: Donation): string {
    return formatCedis(d.amountMinor);
  }
}
