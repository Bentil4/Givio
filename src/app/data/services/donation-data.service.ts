import { Injectable, inject } from '@angular/core';
import { Channel, ID, Models, Query } from 'appwrite';
import { DATABASES, FUNCTIONS, REALTIME } from '../appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { appDb } from '../dexie/app-db';
import type { OutboxEntry } from '../dexie/outbox-entry';
import type { Donation, DonationDraft } from '../models/donation';
import { AuthService } from './auth.service';
import { ServiceError } from './service-error';
import { writeAuditLog } from './audit-log-writer';
import { environment } from '../../../environments/environment';

type UpdateDonationPatch = Partial<
  Pick<Donation, 'donorName' | 'amountMinor' | 'donationType' | 'onBehalfOf'>
>;

/** Mirrors the row shape recordDonation's Function writes (donation-recording.js). */
function rowToDonation(row: Models.DefaultRow): Donation {
  return {
    id: row['$id'],
    eventId: row['eventId'],
    receiptNumber: row['receiptNumber'],
    donorName: row['donorName'],
    amountMinor: row['amountMinor'] ?? null,
    donationType: row['donationType'],
    onBehalfOf: row['onBehalfOf'] ?? undefined,
    donorPhone: row['donorPhone'] ?? undefined,
    notes: row['notes'] ?? undefined,
    recordedBy: row['recordedBy'],
    recordedAt: row['recordedAt'],
    deskLabel: row['deskLabel'] ?? undefined,
    syncStatus: row['syncStatus'] ?? 'synced',
    deletedAt: row['deletedAt'] ?? null,
    deletedBy: row['deletedBy'] ?? undefined,
    deletionReason: row['deletionReason'] ?? undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class DonationDataService {
  private readonly databases = inject(DATABASES);
  private readonly functions = inject(FUNCTIONS);
  private readonly realtime = inject(REALTIME);
  private readonly authService = inject(AuthService);

  /**
   * First Realtime use in the app (Story 4.1) — resolves the Architecture Spine's Deferred
   * Realtime item for donations. Fires `onChange` on any create/update/delete anywhere in the
   * table; the caller decides what to refetch. Admin-dashboard-only by design: Operators
   * already have their own offline-first flow and a live socket would fight that, not help it.
   */
  async subscribeToChanges(onChange: () => void): Promise<() => void> {
    const subscription = await this.realtime.subscribe(
      Channel.tablesdb(environment.appwriteDatabaseId)
        .table(environment.donationsCollectionId)
        .row(),
      () => onChange(),
    );
    return () => {
      void subscription.close();
    };
  }

  /**
   * Server-pull, same shape as EventDataService.listEvents(): without this, a device that
   * never itself created/synced a donation for this event would see nothing. Appwrite's own
   * document permissions (computeDonationPermissions, donation-recording.js) do the scoping —
   * Admin's Role.label('admin') sees every row, an Operator's Role.user(uid) permission only
   * exists on rows for events they're assigned to — so no client-side filtering is needed
   * beyond the eventId query itself.
   *
   * Never throws: offline/unreachable just means this device falls back to whatever it
   * already has locally (FR-OFF-002).
   */
  async listDonationsForEvent(eventId: string): Promise<Donation[]> {
    await this.pullDonations(Query.equal('eventId', eventId));
    return appDb.donations.where('eventId').equals(eventId).toArray();
  }

  /** Admin-wide, unscoped by event (admin-donations/admin-trash) — Admin's Role.label('admin')
   *  read permission already covers every donation row, no per-event query needed. */
  async listAllDonations(): Promise<Donation[]> {
    await this.pullDonations();
    return appDb.donations.toArray();
  }

  private async pullDonations(filterQuery?: string): Promise<void> {
    try {
      const remoteDonations = await this.fetchAllDonationRows(filterQuery);
      const pendingIds = new Set(
        (await appDb.outbox.where('entityType').equals('donation').toArray()).map(
          (e) => e.entityId,
        ),
      );
      for (const donation of remoteDonations) {
        // An unsynced local create/edit sitting in the outbox wins until it syncs.
        if (pendingIds.has(donation.id)) continue;
        await appDb.donations.put(donation);
      }
    } catch {
      // Offline or unreachable — fall through to whatever's already local.
    }
  }

  private async fetchAllDonationRows(filterQuery?: string): Promise<Donation[]> {
    const PAGE_SIZE = 100;
    const donations: Donation[] = [];
    let cursor: string | undefined;

    for (;;) {
      const queries = filterQuery ? [filterQuery, Query.limit(PAGE_SIZE)] : [Query.limit(PAGE_SIZE)];
      if (cursor) queries.push(Query.cursorAfter(cursor));

      const page = await this.databases.listRows<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.donationsCollectionId,
        queries,
      });

      donations.push(...page.rows.map(rowToDonation));
      if (page.rows.length < PAGE_SIZE) break;
      cursor = page.rows[page.rows.length - 1].$id;
    }

    return donations;
  }

  async createDonation(draft: DonationDraft): Promise<Donation> {
    const event = await appDb.events.get(draft.eventId);
    if (!event) {
      throw new ServiceError('Event not found');
    }
    if (event.status !== 'active') {
      throw new ServiceError('Cannot record a donation against a paused or closed event');
    }

    const now = new Date().toISOString();
    const donation: Donation = {
      id: ID.unique(),
      eventId: draft.eventId,
      // Full provisional-then-final receipt numbering (AD-8) is Story 3.6's scope — this is
      // just a placeholder satisfying the (required) field until that story assigns real ones.
      receiptNumber: `P-${Date.now().toString(36).toUpperCase()}`,
      donorName: draft.donorName,
      amountMinor: draft.amountMinor,
      donationType: draft.donationType,
      onBehalfOf: draft.onBehalfOf,
      donorPhone: draft.donorPhone,
      notes: draft.notes,
      recordedBy: this.authService.currentUser()!.$id,
      recordedAt: now,
      syncStatus: 'pending',
    };

    try {
      await appDb.donations.put(donation);
    } catch (error) {
      throw new ServiceError('Failed to save donation locally', error);
    }

    const entry: OutboxEntry = {
      entityType: 'donation',
      entityId: donation.id,
      op: 'create',
      payload: donation,
      status: 'pending',
      retries: 0,
      createdAt: now,
    };
    entry.localId = await appDb.outbox.add(entry);
    const synced = await this.trySyncNow(donation, entry);
    if (synced) {
      await this.logDonationAudit('create', donation, donation);
    }

    return donation;
  }

  /**
   * Stand-in for the not-yet-built SyncEngine (Story 3.5), identical in spirit to
   * EventDataService's own trySyncNow: never throws — a network failure must not block the
   * caller from having their locally-saved Donation.
   *
   * Unlike EventDataService.createEvent (which sets its own document permissions directly,
   * client-side, because the only role it ever grants is `Role.label('admin')` — a role the
   * creating Admin already holds), this goes through the Function: an Operator's own session
   * cannot grant `Role.label('admin')` or `Role.user(otherOperatorId)` permissions on a
   * document it creates, only a role it already holds itself. Recording a donation needs both,
   * so it needs the same elevated trust as Story 2.3's assignOperators (AD-9).
   */
  private async trySyncNow(donation: Donation, entry: OutboxEntry): Promise<boolean> {
    try {
      await invokeAdminFunction(this.functions, 'recordDonation', 'Failed to save donation', {
        donationId: donation.id,
        eventId: donation.eventId,
        receiptNumber: donation.receiptNumber,
        donorName: donation.donorName,
        amountMinor: donation.amountMinor,
        donationType: donation.donationType,
        onBehalfOf: donation.onBehalfOf,
        donorPhone: donation.donorPhone,
        notes: donation.notes,
        recordedAt: donation.recordedAt,
      });
      if (entry.localId !== undefined) {
        await appDb.outbox.delete(entry.localId);
      }
      donation.syncStatus = 'synced';
      await appDb.donations.put(donation);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Admin-only (enforced by the calling screens' route guards, same as updateEvent): Admin
   * already holds Permission.update(Role.label('admin')) on every donation row from creation
   * (computeDonationPermissions, donation-recording.js), so this is a direct client update —
   * no elevated-trust Function call needed, unlike createDonation.
   *
   * NOTE: the live Appwrite `donations` table's schema was set up before this method existed;
   * if it doesn't yet have an `updatedAt` column, the local edit still saves and shows
   * immediately (Dexie-first), it just stays stuck `pending` until that column is added.
   */
  async updateDonation(id: string, patch: UpdateDonationPatch, reason: string): Promise<Donation> {
    const current = await appDb.donations.get(id);
    if (!current) {
      throw new ServiceError('Donation not found');
    }
    if (current.deletedAt) {
      throw new ServiceError('Cannot edit a deleted donation');
    }

    const updated: Donation = { ...current, ...patch, updatedAt: new Date().toISOString() };

    try {
      await appDb.donations.put(updated);
    } catch (error) {
      throw new ServiceError('Failed to save donation locally', error);
    }

    const synced = await this.queueAndSyncUpdate(current, updated);
    if (synced) {
      await this.logDonationAudit('edit', current, { ...updated, reason });
    }

    return updated;
  }

  async softDeleteDonation(id: string, reason: string): Promise<Donation> {
    const current = await appDb.donations.get(id);
    if (!current) {
      throw new ServiceError('Donation not found');
    }
    if (current.deletedAt) {
      throw new ServiceError('Donation is already deleted');
    }

    const now = new Date().toISOString();
    const updated: Donation = {
      ...current,
      deletedAt: now,
      deletedBy: this.authService.currentUser()!.$id,
      deletionReason: reason,
      updatedAt: now,
    };

    try {
      await appDb.donations.put(updated);
    } catch (error) {
      throw new ServiceError('Failed to save donation locally', error);
    }

    const synced = await this.queueAndSyncUpdate(current, updated);
    if (synced) {
      await this.logDonationAudit('delete', current, updated);
    }

    return updated;
  }

  async recoverDonation(id: string): Promise<Donation> {
    const current = await appDb.donations.get(id);
    if (!current) {
      throw new ServiceError('Donation not found');
    }
    if (!current.deletedAt) {
      throw new ServiceError('Donation is not deleted');
    }

    const updated: Donation = {
      ...current,
      deletedAt: null,
      deletedBy: undefined,
      deletionReason: undefined,
      updatedAt: new Date().toISOString(),
    };

    try {
      await appDb.donations.put(updated);
    } catch (error) {
      throw new ServiceError('Failed to save donation locally', error);
    }

    const synced = await this.queueAndSyncUpdate(current, updated);
    if (synced) {
      await this.logDonationAudit('recover', current, updated);
    }

    return updated;
  }

  private async queueAndSyncUpdate(current: Donation, updated: Donation): Promise<boolean> {
    const entry: OutboxEntry = {
      entityType: 'donation',
      entityId: updated.id,
      op: 'update',
      payload: updated,
      baseUpdatedAt: current.updatedAt,
      status: 'pending',
      retries: 0,
      createdAt: updated.updatedAt!,
    };
    entry.localId = await appDb.outbox.add(entry);
    return this.trySyncUpdate(entry);
  }

  // Same "never block the caller on a network failure" rule as trySyncNow — this is a plain
  // client update (see updateDonation's doc comment for why no Function is needed here).
  private async trySyncUpdate(entry: OutboxEntry): Promise<boolean> {
    try {
      await this.databases.updateRow({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.donationsCollectionId,
        rowId: entry.entityId,
        data: entry.payload as Record<string, unknown>,
      });
      if (entry.localId !== undefined) {
        await appDb.outbox.delete(entry.localId);
      }
      return true;
    } catch {
      return false;
    }
  }

  // An audit entry referencing a document not yet in Appwrite would be meaningless, so the
  // write is skipped whenever the sync above left the outbox entry pending — same rule as
  // EventDataService.updateEvent.
  private async logDonationAudit(
    action: 'create' | 'edit' | 'delete' | 'recover',
    previousValues: Donation,
    newValues: unknown,
  ): Promise<void> {
    try {
      await writeAuditLog(this.databases, {
        entityType: 'donation',
        entityId: previousValues.id,
        action,
        performedBy: this.authService.currentUser()!.$id,
        previousValues,
        newValues,
      });
    } catch (error) {
      console.error(`DonationDataService: failed to write '${action}' audit log`, error);
    }
  }
}
