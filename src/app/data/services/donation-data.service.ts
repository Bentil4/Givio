import { Injectable, inject } from '@angular/core';
import { Channel, ID, Models, Query } from 'appwrite';
import { DATABASES, FUNCTIONS, REALTIME } from '../../core/appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { appDb } from '../dexie/app-db';
import type { OutboxEntry } from '../models/outbox-entry';
import type { Donation, DonationDraft } from '../models/donation';
import type { Event } from '../models/event';
import { eventShortCode, provisionalReceiptNumber } from '../../utils/receipt-numbering.util';
import { AuthService } from './auth.service';
import { ServiceError } from '../../core/services/service-error';
import {
  ALL_ROWS_ENTITY_ID,
  distinctTenantIds,
  logAdminAccess,
  tenantIdOfLocalEvent,
  writeAuditLog,
} from './audit-log-writer';
import { environment } from '../../../environments/environment';
import { definitiveRejectionReason } from './sync-rejection';
import { rowToDonation } from '../appwrite/donation-row';

interface RecordDonationResult {
  success: true;
  donation: { receiptNumber: string };
}

type UpdateDonationPatch = Partial<
  Pick<Donation, 'donorName' | 'amountMinor' | 'donationType' | 'onBehalfOf'>
>;

type SyncOutcome = 'synced' | 'pending' | 'conflict' | 'failed';

@Injectable({ providedIn: 'root' })
export class DonationDataService {
  private readonly databases = inject(DATABASES);
  private readonly functions = inject(FUNCTIONS);
  private readonly realtime = inject(REALTIME);
  private readonly authService = inject(AuthService);

  /**
   * First Realtime use in the app (Story 4.1) — resolves the Architecture Spine's Deferred
   * Realtime item for donations. Fires `onChange` on any create/update/delete anywhere in the
   * table; the caller decides what to refetch. Also used by operator-donations.ts (Story 5.3) —
   * safe alongside the offline-first flow because every caller refetches through
   * loadDonationsForEvent/loadAllDonations, which already skip any row with a pending outbox
   * entry, so a live push can never clobber a not-yet-synced local write.
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
   *
   * Story 8.2: an Admin caller's read is access-logged only when the server pull succeeded —
   * same reasoning as EventDataService.listEvents(). Donations carry no tenantId, so the
   * tenant is resolved from the locally-cached Event after the read has already returned.
   */
  async listDonationsForEvent(eventId: string): Promise<Donation[]> {
    const remote = await this.pullDonations(Query.equal('eventId', eventId));
    if (remote) {
      logAdminAccess(this.databases, {
        user: this.authService.currentUser(),
        target: { entityType: 'donation', entityId: eventId },
        details: async () => {
          const event = await appDb.events.get(eventId);
          return {
            query: 'listDonationsForEvent',
            tenantId: event?.tenantId ?? null,
            tenantIds: event ? distinctTenantIds([event]) : [],
            eventId,
            eventName: event?.name,
            rowCount: remote.length,
          };
        },
      });
    }
    return appDb.donations.where('eventId').equals(eventId).toArray();
  }

  /** Admin-wide, unscoped by event (admin-donations/admin-trash) — Admin's Role.label('admin')
   *  read permission already covers every donation row, no per-event query needed.
   *
   *  Story 8.2: this is also the admin-dashboard's Realtime refetch path, so every live push
   *  it reacts to logs its own entry. That's deliberate — each refetch is a fresh server read
   *  of every tenant's donations, and AD-12 forbids coalescing above the Data layer. */
  async listAllDonations(): Promise<Donation[]> {
    const remote = await this.pullDonations();
    if (remote) {
      logAdminAccess(this.databases, {
        user: this.authService.currentUser(),
        target: { entityType: 'donation', entityId: ALL_ROWS_ENTITY_ID },
        details: async () => {
          const eventIds = [...new Set(remote.map((d) => d.eventId))];
          const events = await appDb.events.bulkGet(eventIds);
          return {
            query: 'listAllDonations',
            tenantId: null,
            tenantIds: distinctTenantIds(events.filter((e): e is Event => e !== undefined)),
            rowCount: remote.length,
          };
        },
      });
    }
    return appDb.donations.toArray();
  }

  /** Resolves to the rows the server returned, or null when it couldn't be reached. */
  private async pullDonations(filterQuery?: string): Promise<Donation[] | null> {
    try {
      const remoteDonations = await this.fetchAllDonationRows(filterQuery);
      await this.cacheRemoteDonations(remoteDonations);
      return remoteDonations;
    } catch {
      // Offline or unreachable — fall through to whatever's already local.
      return null;
    }
  }

  /** An unsynced local create/edit sitting in the outbox wins until it syncs. */
  private async cacheRemoteDonations(remoteDonations: Donation[]): Promise<void> {
    const pendingIds = new Set(
      (await appDb.outbox.where('entityType').equals('donation').toArray()).map((e) => e.entityId),
    );
    const syncedDonations = remoteDonations.filter((donation) => !pendingIds.has(donation.id));
    for (const donation of syncedDonations) {
      await appDb.donations.put(donation);
    }
  }

  private async fetchAllDonationRows(filterQuery?: string): Promise<Donation[]> {
    const PAGE_SIZE = 100;
    const donations: Donation[] = [];
    let cursor: string | undefined;

    for (;;) {
      const queries = filterQuery
        ? [filterQuery, Query.limit(PAGE_SIZE)]
        : [Query.limit(PAGE_SIZE)];
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
    const event = await this.eventAcceptingDonations(draft.eventId);
    const now = new Date().toISOString();
    const donation = await this.buildPendingDonation(draft, event, now);
    await this.saveDonationLocally(donation);
    const entry = await this.enqueueDonationCreate(donation, now);
    const outcome = await this.trySyncNow(donation, entry);
    if (outcome === 'synced') {
      await this.logDonationAudit('create', donation, donation);
    }
    if (outcome === 'failed') {
      await this.discardRejectedCreate(entry, donation);
    }
    return donation;
  }

  private async eventAcceptingDonations(eventId: string): Promise<Event> {
    const event = await appDb.events.get(eventId);
    if (!event) {
      throw new ServiceError('Event not found');
    }
    if (event.status !== 'active') {
      throw new ServiceError('Cannot record a donation against a paused or closed event');
    }
    return event;
  }

  private async buildPendingDonation(
    draft: DonationDraft,
    event: Event,
    now: string,
  ): Promise<Donation> {
    return {
      id: ID.unique(),
      eventId: draft.eventId,
      // Provisional (AD-8/Story 3.6): the receipt prints instantly, online or offline, without
      // waiting on a network round-trip. trySyncNow below overwrites this with the Function's
      // canonical number the moment the row actually reaches Appwrite.
      receiptNumber: await this.nextProvisionalReceiptNumber(event),
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
  }

  private async saveDonationLocally(donation: Donation): Promise<void> {
    try {
      await appDb.donations.put(donation);
    } catch (error) {
      throw new ServiceError('Failed to save donation locally', error);
    }
  }

  private async enqueueDonationCreate(donation: Donation, now: string): Promise<OutboxEntry> {
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
    return entry;
  }

  /**
   * Rejected while the Operator is still on the read-back screen: nothing reached the server,
   * so the local copy goes and the reason is shown there instead — the draft is still on
   * screen to correct, and no receipt gets offered for a record that won't exist.
   */
  private async discardRejectedCreate(entry: OutboxEntry, donation: Donation): Promise<never> {
    await appDb.outbox.delete(entry.localId!);
    await appDb.donations.delete(donation.id);
    throw new ServiceError(entry.lastError ?? 'The server rejected this donation');
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
  /**
   * Called by SyncEngineService to retry a queued entry outside its original create/update/
   * delete/recover call site — e.g. once connectivity returns. A retried create still gets its
   * audit entry (previousValues/newValues are just the donation itself, nothing lost by the
   * delay). A retried update does not: the `reason` string and the pre-edit previousValues
   * only exist at the original call site, not in the outbox entry, so a background retry
   * can't reconstruct a meaningful audit entry — same limitation as EventDataService's version
   * of this method. This is a known, bounded gap, not silently pretended away.
   */
  async retryOutboxEntry(entry: OutboxEntry): Promise<SyncOutcome> {
    if (entry.op === 'create') {
      const donation = entry.payload as Donation;
      const outcome = await this.trySyncNow(donation, entry);
      if (outcome === 'synced') {
        await this.logDonationAudit('create', donation, donation);
      }
      return outcome;
    }
    const outcome = await this.trySyncUpdate(entry);
    const donation = entry.payload as Donation;
    donation.syncStatus = outcome;
    await appDb.donations.put(donation);
    return outcome;
  }

  /**
   * A device-local count of this event's still-provisional receipts (Story 3.6/AD-8) — every
   * donation whose number already got finalized by trySyncNow below no longer matches this
   * prefix, so the count is always "how many provisional slots are currently in use for this
   * event on this device," not a monotonic lifetime total. That's exactly what's needed: two
   * offline donations recorded back-to-back on the same device must never share a provisional
   * number, but a retired one is safe to reuse once its donation has synced.
   */
  private async nextProvisionalReceiptNumber(event: Event): Promise<string> {
    const prefix = `${eventShortCode(event)}-P`;
    const existing = await appDb.donations.where('eventId').equals(event.id).toArray();
    const sequence = existing.filter((d) => d.receiptNumber.startsWith(prefix)).length + 1;
    return provisionalReceiptNumber(event, sequence);
  }

  private async trySyncNow(
    donation: Donation,
    entry: OutboxEntry,
  ): Promise<'synced' | 'pending' | 'failed'> {
    try {
      const result = await invokeAdminFunction<RecordDonationResult>(this.functions, {
        action: 'recordDonation',
        invokeFailureMessage: 'Failed to save donation',
        payload: {
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
        },
      });
      if (entry.localId !== undefined) {
        await appDb.outbox.delete(entry.localId);
      }
      // The Function assigns the canonical sequential number the moment this row actually
      // reaches Appwrite (AD-8) — nothing already printed needs reprinting, only this stored
      // value changes.
      donation.receiptNumber = result.donation.receiptNumber;
      donation.syncStatus = 'synced';
      await appDb.donations.put(donation);
      return 'synced';
    } catch (error) {
      const reason = definitiveRejectionReason(error);
      if (reason === null) return 'pending';
      await this.markRejected(entry, donation, reason);
      return 'failed';
    }
  }

  /**
   * Terminal: a definitive 4xx means the same payload would be refused on every retry, so the
   * entry stops being retried and stops counting as pending — but it stays on the device,
   * reason attached, until the Operator dismisses it. Never re-homed or corrected
   * automatically (Story 6.6: a 409 event mismatch must not be silently fixed).
   */
  private async markRejected(
    entry: OutboxEntry,
    donation: Donation,
    reason: string,
  ): Promise<void> {
    entry.status = 'failed';
    entry.lastError = reason;
    if (entry.localId !== undefined) {
      await appDb.outbox.update(entry.localId, { status: 'failed', lastError: reason });
    }
    donation.syncStatus = 'failed';
    await appDb.donations.put(donation);
  }

  /**
   * The Operator's "Dismiss" on a rejected outbox entry. Only ever for an entry the server
   * already refused — a rejected create never wrote anything server-side, so removing the local
   * copy loses nothing the server has; for a rejected edit, the next pull restores the server's
   * own version. Audited best-effort so an Admin can still see a recorded gift was discarded.
   */
  async dismissRejected(localId: number): Promise<void> {
    const entry = await appDb.outbox.get(localId);
    if (!entry || entry.entityType !== 'donation' || entry.status !== 'failed') {
      throw new ServiceError('Only a record the server rejected can be dismissed');
    }
    const donation = (await appDb.donations.get(entry.entityId)) ?? (entry.payload as Donation);
    await appDb.outbox.delete(localId);
    await appDb.donations.delete(entry.entityId);
    await this.logDonationAudit('delete', donation, {
      ...donation,
      deletionReason: `Dismissed on device after the server rejected it: ${entry.lastError ?? 'no reason given'}`,
    });
  }

  /**
   * Admin-only (enforced by the calling screens' route guards, same as updateEvent): Admin
   * already holds Permission.update(Role.label('admin')) on every donation row from creation
   * (computeDonationPermissions, donation-recording.js), so this is a direct client update —
   * no elevated-trust Function call needed, unlike createDonation.
   *
   * NOTE: the live Appwrite `donations` table's schema was set up before this method existed;
   * if it doesn't yet have an `updatedAt` column, the local edit still saves and shows
   * immediately (Dexie-first), but Appwrite answers the sync with a 400, so it ends up `failed`
   * rather than retried forever.
   */
  async updateDonation(id: string, patch: UpdateDonationPatch, reason: string): Promise<Donation> {
    const current = await appDb.donations.get(id);
    if (!current) {
      throw new ServiceError('Donation not found');
    }
    if (current.deletedAt) {
      throw new ServiceError('Cannot edit a deleted donation');
    }

    const updated: Donation = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };

    try {
      await appDb.donations.put(updated);
    } catch (error) {
      throw new ServiceError('Failed to save donation locally', error);
    }

    const outcome = await this.queueAndSyncUpdate(current, updated);
    if (outcome === 'synced') {
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
      syncStatus: 'pending',
    };

    try {
      await appDb.donations.put(updated);
    } catch (error) {
      throw new ServiceError('Failed to save donation locally', error);
    }

    const outcome = await this.queueAndSyncUpdate(current, updated);
    if (outcome === 'synced') {
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
      syncStatus: 'pending',
    };

    try {
      await appDb.donations.put(updated);
    } catch (error) {
      throw new ServiceError('Failed to save donation locally', error);
    }

    const outcome = await this.queueAndSyncUpdate(current, updated);
    if (outcome === 'synced') {
      await this.logDonationAudit('restore', current, updated);
    }

    return updated;
  }

  private async queueAndSyncUpdate(current: Donation, updated: Donation): Promise<SyncOutcome> {
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
    const outcome = await this.trySyncUpdate(entry);
    if (outcome === 'failed') {
      // Same as a rejected create at its call site: the Admin is still on the edit screen, so
      // the local row goes back to what it was and the reason is surfaced there.
      await appDb.outbox.delete(entry.localId);
      await appDb.donations.put(current);
      throw new ServiceError(entry.lastError ?? 'The server rejected this change');
    }
    updated.syncStatus = outcome;
    await appDb.donations.put(updated);
    return outcome;
  }

  /**
   * Same "never block the caller on a network failure" rule as trySyncNow — this is a plain
   * client update (see updateDonation's doc comment for why no Function is needed here) — with
   * one addition: before applying it, checks the row's current `updatedAt` against this edit's
   * `baseUpdatedAt` (AD-3). A mismatch means somebody else's change landed first — the server
   * row is left untouched and the conflict goes to Admin instead of silently overwriting it.
   */
  private async trySyncUpdate(entry: OutboxEntry): Promise<SyncOutcome> {
    // The row can't exist server-side before its own queued create has synced — asking now
    // would get a 404 that looks exactly like a definitive rejection.
    const unsyncedCreate = await appDb.outbox
      .where('entityType')
      .equals('donation')
      .filter((e) => e.op === 'create' && e.entityId === entry.entityId && e.status === 'pending')
      .count();
    if (unsyncedCreate > 0) return 'pending';

    try {
      const currentRow = await this.databases.getRow<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.donationsCollectionId,
        rowId: entry.entityId,
      });

      if ((currentRow['updatedAt'] ?? null) !== (entry.baseUpdatedAt ?? null)) {
        return this.fileConflict(entry, rowToDonation(currentRow));
      }

      await this.databases.updateRow({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.donationsCollectionId,
        rowId: entry.entityId,
        data: entry.payload as Record<string, unknown>,
      });
      if (entry.localId !== undefined) {
        await appDb.outbox.delete(entry.localId);
      }
      return 'synced';
    } catch (error) {
      const reason = definitiveRejectionReason(error);
      if (reason === null) return 'pending';
      await this.markRejected(entry, entry.payload as Donation, reason);
      return 'failed';
    }
  }

  /**
   * Files the losing version to donation_conflicts via the Function (AD-9 — same elevated-
   * trust need as recordDonation: this device's own session can't grant the admin-only
   * read/update permissions that row needs). The outbox entry is cleared either way: once a
   * conflict is on record, blindly retrying the same stale update would just conflict again.
   */
  private async fileConflict(entry: OutboxEntry, serverVersion: Donation): Promise<SyncOutcome> {
    const localVersion = entry.payload as Donation;
    try {
      await invokeAdminFunction(this.functions, {
        action: 'recordConflict',
        invokeFailureMessage: 'Failed to record sync conflict',
        payload: {
          receiptNumber: localVersion.receiptNumber,
          eventId: localVersion.eventId,
          localVersion,
          serverVersion,
        },
      });
    } catch (error) {
      // Couldn't reach the Function to file it — leave the outbox entry in place so the next
      // drain re-checks and retries recordConflict, rather than silently discarding the edit.
      console.error('DonationDataService: failed to record sync conflict', error);
      return 'pending';
    }

    if (entry.localId !== undefined) {
      await appDb.outbox.delete(entry.localId);
    }
    return 'conflict';
  }

  // An audit entry referencing a document not yet in Appwrite would be meaningless, so the
  // write is skipped whenever the sync above left the outbox entry pending — same rule as
  // EventDataService.updateEvent.
  private async logDonationAudit(
    action: 'create' | 'edit' | 'delete' | 'restore',
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
        tenantId: await tenantIdOfLocalEvent(previousValues.eventId),
      });
    } catch (error) {
      console.error(`DonationDataService: failed to write '${action}' audit log`, error);
    }
  }
}
