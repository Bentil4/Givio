import { Injectable, inject } from '@angular/core';
import { Models, Query } from 'appwrite';
import { DATABASES } from '../../core/appwrite/client';
import { appDb } from '../dexie/app-db';
import type { Event } from '../models/event';
import { environment } from '../../../environments/environment';

/** The row's `$id` is authoritative — it's what Function writes actually key on. */
function rowToEvent(row: Models.DefaultRow): Event {
  return {
    id: row['$id'],
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

/** An Operator's read-only view of the Events they're assigned to, cached for offline use. */
@Injectable({ providedIn: 'root' })
export class EventDataService {
  private readonly databases = inject(DATABASES);

  /**
   * Server-pull (Story 2.1's added AC, FR-DEV-003): without this, a device that never itself
   * synced an event would see nothing. Appwrite's own row permissions do the scoping — an
   * Operator's Role.user(uid) read only exists on rows the assignOperators Function put them
   * in — so no client-side filtering is needed here. Every Event write goes through the
   * Function (AD-9), so the pull never has a local edit to protect.
   *
   * Never throws: offline/unreachable just means this device falls back to whatever it
   * already has locally (FR-OFF-002).
   */
  async listEvents(): Promise<Event[]> {
    try {
      await appDb.events.bulkPut(await this.fetchAllEventRows());
    } catch {
      // Offline or unreachable — fall through to the local read below.
    }
    return appDb.events.toArray();
  }

  private async fetchAllEventRows(): Promise<Event[]> {
    const PAGE_SIZE = 100;
    const events: Event[] = [];
    let cursor: string | undefined;

    for (;;) {
      const queries = [Query.limit(PAGE_SIZE)];
      if (cursor) queries.push(Query.cursorAfter(cursor));

      const page = await this.databases.listRows<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.eventsCollectionId,
        queries,
      });

      events.push(...page.rows.map(rowToEvent));
      if (page.rows.length < PAGE_SIZE) break;
      cursor = page.rows[page.rows.length - 1].$id;
    }

    return events;
  }
}
