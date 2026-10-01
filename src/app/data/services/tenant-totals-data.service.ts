import { Injectable, inject } from '@angular/core';
import { Channel, Query } from 'appwrite';
import type { Models, RealtimeResponseEvent, RealtimeSubscription } from 'appwrite';
import { DATABASES, REALTIME } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { environment } from '../../../environments/environment';
import type { Event, EventStatus } from '../models/event';
import { countedDonations, totalMinor, type CountableDonation } from '../../utils/donation.util';

export interface EventFigures {
  totalMinor: number;
  donorCount: number;
}

export interface TenantChangeListeners {
  /** A donation on this Event was created, edited or soft-deleted. */
  onDonationChanged: (eventId: string) => void;
  /** An Event row was created or updated — renamed, moved between statuses, or counted on. */
  onEventChanged: (change: EventRowChange) => void;
}

/** The Event fields the dashboard shows, read straight off a Realtime payload. */
export type EventRowChange = Pick<Event, 'id' | 'name' | 'status'>;

const EVENT_STATUSES: readonly string[] = ['active', 'paused', 'closed'] satisfies EventStatus[];

const PAGE_SIZE = 100;
const COUNTED_COLUMNS = ['$id', 'amountMinor', 'deletedAt', 'syncStatus'];

/**
 * Story 8.4: read-only aggregates for the company dashboard. An approved tenant's
 * organizer-tier members hold read on its Events and every one of their Donations (AD-2,
 * amended 2026-09-30), so figures are read straight from Appwrite. Row security does the
 * tenant scoping on both paths: listRows never returns another tenant's rows, and Appwrite
 * Realtime only delivers events for rows the session can read.
 *
 * Deliberately separate from DonationDataService: an Organizer never records donations on
 * this device, so nothing here touches the Dexie cache or outbox.
 */
@Injectable({ providedIn: 'root' })
export class TenantTotalsDataService {
  private readonly databases = inject(DATABASES);
  private readonly realtime = inject(REALTIME);

  async loadEventFigures(eventId: string): Promise<EventFigures> {
    try {
      const donations = await this.fetchCountableDonations(eventId);
      return { totalMinor: totalMinor(donations), donorCount: countedDonations(donations).length };
    } catch (error) {
      throw new ServiceError("We couldn't load this event's total", error);
    }
  }

  /** Resolves to a cleanup function that closes both subscriptions. */
  async subscribeToTenantChanges(listeners: TenantChangeListeners): Promise<() => void> {
    const subscriptions = await Promise.all([
      this.realtime.subscribe(tableChannel(environment.donationsCollectionId), (event) =>
        notifyDonationChange(event, listeners),
      ),
      this.realtime.subscribe(tableChannel(environment.eventsCollectionId), (event) =>
        notifyEventChange(event, listeners),
      ),
    ]);
    return () => closeSubscriptions(subscriptions);
  }

  private async fetchCountableDonations(eventId: string): Promise<CountableDonation[]> {
    const donations: CountableDonation[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.databases.listRows<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.donationsCollectionId,
        queries: eventDonationQueries(eventId, cursor),
      });
      donations.push(...page.rows.map(rowToCountableDonation));
      if (page.rows.length < PAGE_SIZE) {
        return donations;
      }
      cursor = page.rows[page.rows.length - 1].$id;
    }
  }
}

function eventDonationQueries(eventId: string, cursor: string | undefined): string[] {
  const queries = [
    Query.equal('eventId', [eventId]),
    Query.select(COUNTED_COLUMNS),
    Query.limit(PAGE_SIZE),
  ];
  return cursor ? [...queries, Query.cursorAfter(cursor)] : queries;
}

function rowToCountableDonation(row: Models.DefaultRow): CountableDonation {
  return {
    amountMinor: row['amountMinor'] ?? null,
    deletedAt: row['deletedAt'] ?? null,
    syncStatus: row['syncStatus'] ?? 'synced',
  };
}

function tableChannel(tableId: string) {
  return Channel.tablesdb(environment.appwriteDatabaseId).table(tableId).row();
}

function notifyDonationChange(
  event: RealtimeResponseEvent<unknown>,
  listeners: TenantChangeListeners,
) {
  const eventId = donationEventId(event.payload);
  if (eventId !== null) {
    listeners.onDonationChanged(eventId);
  }
}

function notifyEventChange(
  event: RealtimeResponseEvent<unknown>,
  listeners: TenantChangeListeners,
) {
  const change = eventRowChange(event.payload);
  if (change !== null) {
    listeners.onEventChanged(change);
  }
}

function eventRowChange(payload: unknown): EventRowChange | null {
  return isEventRow(payload)
    ? { id: payload.$id, name: payload.name, status: payload.status }
    : null;
}

function isEventRow(
  payload: unknown,
): payload is { $id: string; name: string; status: EventStatus } {
  const row = (payload ?? {}) as Record<string, unknown>;
  return (
    typeof row['$id'] === 'string' &&
    typeof row['name'] === 'string' &&
    EVENT_STATUSES.includes(row['status'] as string)
  );
}

function donationEventId(payload: unknown): string | null {
  const eventId = (payload as { eventId?: unknown } | null)?.eventId;
  return typeof eventId === 'string' ? eventId : null;
}

function closeSubscriptions(subscriptions: RealtimeSubscription[]): void {
  for (const subscription of subscriptions) {
    void subscription.unsubscribe();
  }
}
