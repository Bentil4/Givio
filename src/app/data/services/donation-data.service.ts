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
import { tenantIdOfLocalEvent, writeAuditLog } from './audit-log-writer';
import { environment } from '../../../environments/environment';
import { definitiveRejectionReason } from './sync-rejection';
import { rowToDonation } from '../appwrite/donation-row';

interface RecordDonationResult {
  success: true;
  donation: { receiptNumber: string };
}

type SyncOutcome = 'synced' | 'pending' | 'failed';

@Injectable({ providedIn: 'root' })
export class DonationDataService {
  private readonly databases = inject(DATABASES);
  private readonly functions = inject(FUNCTIONS);
  private readonly realtime = inject(REALTIME);
  private readonly authService = inject(AuthService);

  /**
   * First Realtime use in the app (Story 4.1) — resolves the Architecture Spine's Deferred
   * Realtime item for donations. Fires `onChange` on any create/update/delete anywhere in the
   * table; the caller decides what to refetch. Used by operator-donations.ts (Story 5.3) —
   * safe alongside the offline-first flow because every caller refetches through
   * loadDonationsForEvent, which already skips any row with a pending outbox entry, so a live
   * push can never clobber a not-yet-synced local write.
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
   * row permissions (resolveEventReadPermissions, donation-recording.js) do the scoping — an
   * Operator's Role.user(uid) read only exists on rows for events they're assigned to — so no
   * client-side filtering is needed beyond the eventId query itself.
   *
   * Never throws: offline/unreachable just means this device falls back to whatever it
   * already has locally (FR-OFF-002).
   */
  async listDonationsForEvent(eventId: string): Promise<Donation[]> {
    await this.pullDonations(eventId);
    return appDb.donations.where('eventId').equals(eventId).toArray();
  }

  private async pullDonations(eventId: string): Promise<void> {
    try {
      await this.cacheRemoteDonations(await this.fetchAllDonationRows(eventId));
    } catch {
      // Offline or unreachable — fall through to whatever's already local.
    }
  }

  /** An unsynced local create sitting in the outbox wins until it syncs. */
  private async cacheRemoteDonations(remoteDonations: Donation[]): Promise<void> {
    const pendingIds = new Set(
      (await appDb.outbox.where('entityType').equals('donation').toArray()).map((e) => e.entityId),
    );
    const syncedDonations = remoteDonations.filter((donation) => !pendingIds.has(donation.id));
    for (const donation of syncedDonations) {
      await appDb.donations.put(donation);
    }
  }

  private async fetchAllDonationRows(eventId: string): Promise<Donation[]> {
    const PAGE_SIZE = 100;
    const donations: Donation[] = [];
    let cursor: string | undefined;

    for (;;) {
      const queries = [Query.equal('eventId', eventId), Query.limit(PAGE_SIZE)];
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
   * Called by SyncEngineService to retry a queued create outside its original call site —
   * e.g. once connectivity returns. A retried create still gets its audit entry
   * (previousValues/newValues are just the donation itself, nothing lost by the delay).
   */
  async retryOutboxEntry(entry: OutboxEntry): Promise<SyncOutcome> {
    const donation = entry.payload as Donation;
    const outcome = await this.trySyncNow(donation, entry);
    if (outcome === 'synced') {
      await this.logDonationAudit('create', donation, donation);
    }
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

  /**
   * Never throws — a network failure must not block the caller from having their
   * locally-saved Donation. Goes through the Function: an Operator's own session cannot grant
   * `Role.user(otherUserId)` read permissions on a row it creates, only a role it already holds
   * itself, so recording a donation needs the same elevated trust as assignOperators (AD-9).
   */
  private async trySyncNow(donation: Donation, entry: OutboxEntry): Promise<SyncOutcome> {
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
   * own version. Audited best-effort so the company can still see a recorded gift was discarded.
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

  // An audit entry referencing a document not yet in Appwrite would be meaningless, so the
  // write is skipped whenever the sync above left the outbox entry pending.
  private async logDonationAudit(
    action: 'create' | 'delete',
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
