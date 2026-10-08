import { Injectable, inject } from '@angular/core';
import { Models, Query } from 'appwrite';
import { DATABASES, FUNCTIONS } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { environment } from '../../../environments/environment';
import type { Event, EventStatus, EventType } from '../models/event';

export interface OrganizerEventDetails {
  name: string;
  date: string;
  hostName: string;
  venue: string | null;
  description?: string | null;
  notes?: string | null;
  image: string | null;
}

export interface NewOrganizerEvent extends OrganizerEventDetails {
  type: EventType;
}

const PAGE_SIZE = 100;

/**
 * Story 6.7: an Organizer-tier member's own company Events. Every write is online-only through
 * the Function, which resolves the caller's Tenant from their Membership at write time (FR-2,
 * FR-9) — there is no Dexie cache or outbox on this path, so nothing tenant-scoped is ever
 * queued with a stale or missing tenantId. Reads go straight to Appwrite: an active
 * organizer-tier member holds read on every Event of an approved tenant (AD-2), and row
 * security means another tenant's Events are simply never returned.
 */
@Injectable({ providedIn: 'root' })
export class OrganizerEventDataService {
  private readonly databases = inject(DATABASES);
  private readonly functions = inject(FUNCTIONS);

  async listTenantEvents(tenantId: string): Promise<Event[]> {
    try {
      return await this.fetchTenantEventRows(tenantId);
    } catch (error) {
      throw new ServiceError("We couldn't load your events", error);
    }
  }

  async createEvent(input: NewOrganizerEvent): Promise<Event> {
    const { event } = await this.callEventFunction<{ event: Models.DefaultRow }>({
      action: 'createTenantEvent',
      failureMessage: "We couldn't create the event",
      payload: input,
    });
    return rowToEvent(event);
  }

  async updateEvent(eventId: string, details: OrganizerEventDetails): Promise<Event> {
    const { event } = await this.callEventFunction<{ event: Models.DefaultRow }>({
      action: 'updateTenantEvent',
      failureMessage: "We couldn't save the event",
      payload: { eventId, ...details },
    });
    return rowToEvent(event);
  }

  async setEventStatus(eventId: string, status: EventStatus): Promise<Event> {
    const { event } = await this.callEventFunction<{ event: Models.DefaultRow }>({
      action: 'setTenantEventStatus',
      failureMessage: "We couldn't change the event's status",
      payload: { eventId, status },
    });
    return rowToEvent(event);
  }

  async assignOperators(eventId: string, assignedUserIds: string[]): Promise<void> {
    await this.callEventFunction({
      action: 'assignOperators',
      failureMessage: "We couldn't save the operator assignment",
      payload: { eventId, assignedUserIds },
    });
  }

  async regenerateAccessCode(eventId: string): Promise<string> {
    const { accessCode } = await this.callEventFunction<{ accessCode: string }>({
      action: 'generateAccessCode',
      failureMessage: "We couldn't generate a family code",
      payload: { eventId },
    });
    return accessCode;
  }

  /** The one call site into the Function for this service. */
  private callEventFunction<T>(call: {
    action: string;
    failureMessage: string;
    payload: object;
  }): Promise<T> {
    return invokeAdminFunction<T>(this.functions, {
      action: call.action,
      invokeFailureMessage: call.failureMessage,
      payload: call.payload,
    });
  }

  private async fetchTenantEventRows(tenantId: string): Promise<Event[]> {
    const events: Event[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.databases.listRows<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.eventsCollectionId,
        queries: tenantEventQueries(tenantId, cursor),
      });
      events.push(...page.rows.map(rowToEvent));
      if (page.rows.length < PAGE_SIZE) {
        return events;
      }
      cursor = page.rows[page.rows.length - 1].$id;
    }
  }
}

function tenantEventQueries(tenantId: string, cursor: string | undefined): string[] {
  const queries = [Query.equal('tenantId', [tenantId]), Query.limit(PAGE_SIZE)];
  return cursor ? [...queries, Query.cursorAfter(cursor)] : queries;
}

// Same mapping as EventDataService's private rowToEvent; kept here while that file is frozen.
function rowToEvent(row: Models.DefaultRow): Event {
  return {
    id: row.$id,
    name: row['name'],
    type: row['type'],
    date: row['date'],
    hostName: row['hostName'],
    venue: row['venue'] ?? undefined,
    description: row['description'] ?? undefined,
    notes: row['notes'] ?? undefined,
    image: row['image'] ?? undefined,
    status: row['status'],
    accessCode: row['accessCode'] ?? undefined,
    tenantId: row['tenantId'] ?? undefined,
    assignedUserIds: row['assignedUserIds'] ?? [],
    createdBy: row['createdBy'],
    nextReceiptSeq: row['nextReceiptSeq'],
    createdAt: row['createdAt'],
    updatedAt: row['updatedAt'],
  };
}
