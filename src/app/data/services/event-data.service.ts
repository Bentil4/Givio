import { Injectable, inject } from '@angular/core';
import { ID, Permission, Role } from 'appwrite';
import { DATABASES, FUNCTIONS } from '../appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { appDb } from '../dexie/app-db';
import type { OutboxEntry } from '../dexie/outbox-entry';
import type { Event } from '../models/event';
import { AuthService } from './auth.service';
import { ServiceError } from './service-error';
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

@Injectable({ providedIn: 'root' })
export class EventDataService {
  private readonly databases = inject(DATABASES);
  private readonly functions = inject(FUNCTIONS);
  private readonly authService = inject(AuthService);

  /**
   * Local-first, same as the rest of this service until Story 3.5/Epic 4's Realtime work
   * lands a real server-pull: only returns events created or edited on this device/browser.
   */
  async listEvents(): Promise<Event[]> {
    return appDb.events.toArray();
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
        await this.writeAuditLog({
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

  async writeAuditLog(entry: {
    entityType: 'event';
    entityId: string;
    action: 'edit';
    performedBy: string;
    previousValues: unknown;
    newValues: unknown;
  }): Promise<void> {
    try {
      await this.databases.createDocument({
        databaseId: environment.appwriteDatabaseId,
        collectionId: environment.auditLogsCollectionId,
        documentId: ID.unique(),
        data: {
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          performedBy: entry.performedBy,
          previousValues: JSON.stringify(entry.previousValues),
          newValues: JSON.stringify(entry.newValues),
          timestamp: new Date().toISOString(),
        },
        permissions: [Permission.read(Role.label('admin'))],
      });
    } catch (error) {
      throw new ServiceError('Failed to write audit log', error);
    }
  }

  /**
   * Stand-in for the not-yet-built SyncEngine (Story 3.5): attempts the real Appwrite write
   * immediately inline. Never throws — a network failure must not block the caller from having
   * their locally-saved Event. Returns whether the sync actually reached Appwrite, since
   * updateEvent() uses that to decide whether an audit log entry is meaningful yet.
   */
  private async trySyncNow(entry: OutboxEntry): Promise<boolean> {
    try {
      if (entry.op === 'create') {
        await this.databases.createDocument({
          databaseId: environment.appwriteDatabaseId,
          collectionId: environment.eventsCollectionId,
          documentId: entry.entityId,
          data: entry.payload as Record<string, unknown>,
          permissions: [
            Permission.read(Role.label('admin')),
            Permission.update(Role.label('admin')),
            Permission.delete(Role.label('admin')),
          ],
        });
      } else {
        await this.databases.updateDocument({
          databaseId: environment.appwriteDatabaseId,
          collectionId: environment.eventsCollectionId,
          documentId: entry.entityId,
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
