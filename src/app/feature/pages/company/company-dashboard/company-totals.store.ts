import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { ServiceError } from '../../../../core/services/service-error';
import type { Event } from '../../../../data/models/event';
import { OrganizerEventDataService } from '../../../../data/services/organizer-event-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import {
  TenantTotalsDataService,
  type EventRowChange,
} from '../../../../data/services/tenant-totals-data.service';
import {
  LOADING_FIGURES,
  isRunningEvent,
  runningEvents,
  summarizeEventTotals,
  type EventTotalRow,
  type FiguresState,
} from './company-totals.util';

/**
 * Story 8.4's live consolidated total, scoped to the dashboard component that provides it.
 * A Realtime push refetches only the Event it concerns; the Event list itself is read once and
 * then patched from Event pushes, re-read only when an Event this page hasn't seen appears.
 */
@Injectable()
export class CompanyTotalsStore {
  private readonly tenantService = inject(TenantService);
  private readonly eventsData = inject(OrganizerEventDataService);
  private readonly totalsData = inject(TenantTotalsDataService);
  private readonly events = signal<Event[]>([]);
  private readonly figures = signal<Readonly<Record<string, FiguresState>>>({});
  // Several pushes for one Event can overlap; only the newest request may write its figures.
  private readonly latestRequestByEvent = new Map<string, number>();
  private requestCount = 0;
  private stopListening: (() => void) | null = null;
  private destroyed = false;
  private readonly donationPushes = signal(0);

  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);

  public readonly rows = computed<EventTotalRow[]>(() =>
    runningEvents(this.events()).map((event) => ({
      event,
      figures: this.figures()[event.id] ?? LOADING_FIGURES,
    })),
  );

  public readonly summary = computed(() => summarizeEventTotals(this.rows()));

  /** Counts donation pushes on any Event, closed ones included, for views built on donations. */
  public readonly donationChangeCount = this.donationPushes.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopRealtime());
  }

  async start(): Promise<void> {
    await this.loadDashboard();
    if (this.loadError() === null) {
      await this.listenForChanges();
    }
  }

  async loadDashboard(): Promise<void> {
    this.loading.set(true);
    try {
      await this.syncEvents();
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(
        error instanceof ServiceError ? error.message : "We couldn't load your total",
      );
    } finally {
      this.loading.set(false);
    }
  }

  retryEvent(eventId: string): void {
    this.figures.update((current) => ({ ...current, [eventId]: LOADING_FIGURES }));
    void this.refreshEventFigures(eventId);
  }

  /** Reads the tenant's Events and loads figures for every Event that just started running. */
  private async syncEvents(): Promise<void> {
    const previouslyRunning = new Set(runningEvents(this.events()).map((event) => event.id));
    const events = await this.eventsData.listTenantEvents(this.currentTenantId());
    this.events.set(events);
    const newlyRunning = runningEvents(events).filter((event) => !previouslyRunning.has(event.id));
    await Promise.all(newlyRunning.map((event) => this.refreshEventFigures(event.id)));
  }

  private currentTenantId(): string {
    const tenantId = this.tenantService.context()?.membership.tenantId;
    if (!tenantId) {
      throw new ServiceError("We couldn't find your company");
    }
    return tenantId;
  }

  private async refreshEventFigures(eventId: string): Promise<void> {
    const request = ++this.requestCount;
    this.latestRequestByEvent.set(eventId, request);
    const next = await this.fetchFiguresState(eventId);
    if (this.latestRequestByEvent.get(eventId) === request) {
      this.figures.update((current) => ({ ...current, [eventId]: next }));
    }
  }

  private async fetchFiguresState(eventId: string): Promise<FiguresState> {
    try {
      return { status: 'loaded', figures: await this.totalsData.loadEventFigures(eventId) };
    } catch {
      return { status: 'failed' };
    }
  }

  private async listenForChanges(): Promise<void> {
    const stop = await this.totalsData.subscribeToTenantChanges({
      onDonationChanged: (eventId) => this.applyDonationChange(eventId),
      onEventChanged: (change) => this.applyEventChange(change),
    });
    this.stopListening = stop;
    if (this.destroyed) {
      this.stopRealtime();
    }
  }

  private applyDonationChange(eventId: string): void {
    this.donationPushes.update((count) => count + 1);
    const event = this.events().find((candidate) => candidate.id === eventId);
    if (event === undefined) {
      void this.resyncEventsQuietly();
    } else if (isRunningEvent(event)) {
      void this.refreshEventFigures(eventId);
    }
  }

  private applyEventChange(change: EventRowChange): void {
    const known = this.events().find((event) => event.id === change.id);
    if (known === undefined) {
      void this.resyncEventsQuietly();
      return;
    }
    this.events.update((events) =>
      events.map((event) => (event.id === change.id ? { ...event, ...change } : event)),
    );
    if (!isRunningEvent(known) && isRunningEvent(change)) {
      void this.refreshEventFigures(change.id);
    }
  }

  /** A failed background re-read keeps the figures already on screen rather than erroring. */
  private async resyncEventsQuietly(): Promise<void> {
    try {
      await this.syncEvents();
    } catch {
      // The next push retries; the visible total stays as it was.
    }
  }

  private stopRealtime(): void {
    this.destroyed = true;
    this.stopListening?.();
    this.stopListening = null;
  }
}
