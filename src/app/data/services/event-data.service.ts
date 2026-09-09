import { Injectable, inject } from '@angular/core';
import { ID, Models, Permission, Query, Role } from 'appwrite';
import { DATABASES, FUNCTIONS } from '../appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { appDb } from '../dexie/app-db';
import type { OutboxEntry } from '../dexie/outbox-entry';
import type { Event } from '../models/event';
import { AuthService } from './auth.service';
import { ServiceError } from './service-error';
import { writeAuditLog } from './audit-log-writer';
import { environment } from '../../../environments/environment';

interface CreateEventInput {
  name: string;
  type: Event['type'];
  date: string;
  hostName: string;
  venue?: string;
  description?: string;
  notes?: string;
}

type UpdateEventPatch = Partial<
  Pick<Event, 'name' | 'date' | 'hostName' | 'venue' | 'description' | 'notes'>
>;

/** The row's `$id` is authoritative — it's what Function/outbox writes actually key on. */
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
    status: row['status'],
    accessCode: row['accessCode'] ?? undefined,
    assignedUserIds: row['assignedUserIds'] ?? [],
    createdBy: row['createdBy'],
    nextReceiptSeq: row['nextReceiptSeq'],
    createdAt: row['createdAt'],
    updatedAt: row['updatedAt'],
  };
}

@Injectable({ providedIn: 'root' })
export class EventDataService {
  private readonly databases = inject(DATABASES);
  private readonly functions = inject(FUNCTIONS);
  private readonly authService = inject(AuthService);

  /**
   * Server-pull (Story 2.1's added AC, FR-DEV-003): without this, a device that never itself
   * created/synced an event would see nothing, no matter the caller's role. Appwrite's own
   * document permissions do the scoping — Admin's Role.label('admin') sees every row, an
   * Operator's Role.user(uid) permission only exists on rows where the assignOperators
   * Function put them in assignedUserIds — so no client-side filtering is needed here.
   *
   * Never throws: offline/unreachable just means this device falls back to whatever it
   * already has locally (FR-OFF-002), same "never block the caller" rule as trySyncNow.
   */
  async listEvents(): Promise<Event[]> {
    try {
      const remoteEvents = await this.fetchAllEventRows();
      const pendingIds = new Set(
        (await appDb.outbox.where('entityType').equals('event').toArray()).map((e) => e.entityId),
      );
      for (const event of remoteEvents) {
        // An unsynced local create/edit sitting in the outbox wins until it syncs — otherwise
        // this pull would stomp it with the stale (or, for a still-unsynced create, nonexistent)
        // server version.
        if (pendingIds.has(event.id)) continue;
        await appDb.events.put(event);
      }
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

  async createEvent(input: CreateEventInput): Promise<Event> {
    const now = new Date().toISOString();
    const event: Event = {
      id: ID.unique(),
      name: input.name,
      type: input.type,
      date: input.date,
      hostName: input.hostName,
      venue: input.venue,
      description: input.description,
      notes: input.notes,
      status: 'active',
      assignedUserIds: [],
      createdBy: this.authService.currentUser()!.$id,
      nextReceiptSeq: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await appDb.events.put(event);
    } catch (error) {
      throw new ServiceError('Failed to save event locally', error);
    }

    const entry: OutboxEntry = {
      entityType: 'event',
      entityId: event.id,
      op: 'create',
      payload: event,
      status: 'pending',
      retries: 0,
      createdAt: now,
    };
    entry.localId = await appDb.outbox.add(entry);
    await this.trySyncNow(entry);

    return event;
  }

  async updateEvent(id: string, patch: UpdateEventPatch): Promise<Event> {
    const current = await appDb.events.get(id);
    if (!current) {
      throw new ServiceError('Event not found');
    }
    if (current.status === 'closed') {
      throw new ServiceError('Cannot edit a closed event');
    }

    const updated: Event = { ...current, ...patch, updatedAt: new Date().toISOString() };

    try {
      await appDb.events.put(updated);
    } catch (error) {
      throw new ServiceError('Failed to save event locally', error);
    }

    const entry: OutboxEntry = {
      entityType: 'event',
      entityId: updated.id,
      op: 'update',
      payload: updated,
      baseUpdatedAt: current.updatedAt,
      status: 'pending',
      retries: 0,
      createdAt: updated.updatedAt,
    };
    entry.localId = await appDb.outbox.add(entry);
    const synced = await this.trySyncNow(entry);

    // An audit entry referencing a document not yet in Appwrite would be meaningless, so the
    // write is skipped (not queued) whenever the sync above left the outbox entry pending —
    // see Story 2.1 Dev Notes for the known gap this leaves until Story 3.5's SyncEngine exists.
    if (synced) {
      try {
        await writeAuditLog(this.databases, {
          entityType: 'event',
          entityId: updated.id,
          action: 'edit',
          performedBy: this.authService.currentUser()!.$id,
          previousValues: current,
          newValues: updated,
        });
      } catch (error) {
        console.error('EventDataService.updateEvent: failed to write audit log', error);
      }
    }

    return updated;
  }

  /**
   * Online-only, unlike createEvent/updateEvent — there's no outbox path here because the
   * whole point is a server-derived write only the trusted Function can make (AD-2/AD-9):
   * Appwrite document permissions can't be set by the client SDK at all, so there's nothing
   * to queue and retry locally the way an ordinary field edit is. A rejected/failed call
   * throws before any local state changes, so Dexie is never left claiming an assignment
   * that Appwrite doesn't actually have.
   */
  async assignOperators(eventId: string, assignedUserIds: string[]): Promise<Event> {
    const current = await appDb.events.get(eventId);
    if (!current) {
      throw new ServiceError('Event not found');
    }

    await invokeAdminFunction(this.functions, 'assignOperators', 'Failed to save operator assignment', {
      eventId,
      assignedUserIds,
    });

    const updated: Event = { ...current, assignedUserIds, updatedAt: new Date().toISOString() };
    try {
      await appDb.events.put(updated);
    } catch (error) {
      // The server write already succeeded — don't report a local cache-write failure as if
      // the assignment itself failed.
      console.error('EventDataService.assignOperators: failed to update local cache', error);
    }

    return updated;
  }

  /**
   * Called by SyncEngineService to retry a queued entry outside its original create/update
   * call site — e.g. once connectivity returns. No audit log here: an edit's previousValues
   * and the reason a donation's equivalent gives (not applicable to events, but the same
   * limits apply) aren't preserved in the outbox entry itself, only at the original call site,
   * so a background retry can't reconstruct a meaningful audit entry the way the inline path
   * can. A real fix needs the outbox to carry that context too — out of scope for this pass.
   */
  async retryOutboxEntry(entry: OutboxEntry): Promise<boolean> {
    return this.trySyncNow(entry);
  }

  /**
   * Online-only, same reasoning as assignOperators/regenerateAccessCode: the transition is
   * validated and written server-side (Story 2.2's setEventStatus Function action), including
   * reopening a Closed event — a transition updateEvent()'s own "Cannot edit a closed event"
   * guard would otherwise block, since that guard is about protecting a closed event's other
   * fields from casual edits, not the status field itself.
   */
  async setEventStatus(eventId: string, status: Event['status']): Promise<Event> {
    const current = await appDb.events.get(eventId);
    if (!current) {
      throw new ServiceError('Event not found');
    }

    await invokeAdminFunction(this.functions, 'setEventStatus', 'Failed to change the event status', {
      eventId,
      status,
    });

    const updated: Event = { ...current, status, updatedAt: new Date().toISOString() };
    try {
      await appDb.events.put(updated);
    } catch (error) {
      console.error('EventDataService.setEventStatus: failed to update local cache', error);
    }

    try {
      await writeAuditLog(this.databases, {
        entityType: 'event',
        entityId: eventId,
        action: 'edit',
        performedBy: this.authService.currentUser()!.$id,
        previousValues: { status: current.status },
        newValues: { status },
      });
    } catch (error) {
      console.error('EventDataService.setEventStatus: failed to write audit log', error);
    }

    return updated;
  }

  /**
   * Online-only, same reasoning as assignOperators: the code itself is generated and written
   * server-side (Story 2.4), so there's nothing meaningful to queue offline.
   */
  async regenerateAccessCode(eventId: string): Promise<Event> {
    const current = await appDb.events.get(eventId);
    if (!current) {
      throw new ServiceError('Event not found');
    }

    const { accessCode } = await invokeAdminFunction<{ accessCode: string }>(
      this.functions,
      'generateAccessCode',
      'Failed to regenerate the family code',
      { eventId },
    );

    const updated: Event = { ...current, accessCode, updatedAt: new Date().toISOString() };
    try {
      await appDb.events.put(updated);
    } catch (error) {
      console.error('EventDataService.regenerateAccessCode: failed to update local cache', error);
    }

    return updated;
  }

  /**
   * Attempts the real Appwrite write immediately inline. Never throws — a network failure
   * must not block the caller from having their locally-saved Event. Returns whether the sync
   * actually reached Appwrite, since updateEvent() uses that to decide whether an audit log
   * entry is meaningful yet.
   */
  private async trySyncNow(entry: OutboxEntry): Promise<boolean> {
    try {
      if (entry.op === 'create') {
        await this.databases.createRow({
          databaseId: environment.appwriteDatabaseId,
          tableId: environment.eventsCollectionId,
          rowId: entry.entityId,
          data: entry.payload as Record<string, unknown>,
          permissions: [
            Permission.read(Role.label('admin')),
            Permission.update(Role.label('admin')),
            Permission.delete(Role.label('admin')),
          ],
        });
      } else {
        await this.databases.updateRow({
          databaseId: environment.appwriteDatabaseId,
          tableId: environment.eventsCollectionId,
          rowId: entry.entityId,
          data: entry.payload as Record<string, unknown>,
        });
      }
      if (entry.localId !== undefined) {
        await appDb.outbox.delete(entry.localId);
      }
      return true;
    } catch {
      return false;
    }
  }
}
