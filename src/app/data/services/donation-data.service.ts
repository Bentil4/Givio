import { Injectable, inject } from '@angular/core';
import { ID } from 'appwrite';
import { FUNCTIONS } from '../appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { appDb } from '../dexie/app-db';
import type { OutboxEntry } from '../dexie/outbox-entry';
import type { Donation, DonationDraft } from '../models/donation';
import { AuthService } from './auth.service';
import { ServiceError } from './service-error';

@Injectable({ providedIn: 'root' })
export class DonationDataService {
  private readonly functions = inject(FUNCTIONS);
  private readonly authService = inject(AuthService);

  /**
   * Local-first, same as EventDataService.listEvents(): only returns donations created or
   * synced onto this device/browser — there's no server-pull yet (Story 3.5's SyncEngine).
   * The event's "live total" this feeds is therefore this-device-only until that lands.
   */
  async listDonationsForEvent(eventId: string): Promise<Donation[]> {
    return appDb.donations.where('eventId').equals(eventId).toArray();
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
    await this.trySyncNow(donation, entry);

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
}
