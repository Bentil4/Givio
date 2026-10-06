import { Injectable, inject } from '@angular/core';
import type { Models } from 'appwrite';
import { DATABASES } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { OrganizerEventDataService } from './organizer-event-data.service';
import { listDonationRowsForEvents } from '../appwrite/donation-rows-for-events';
import type { Donation } from '../models/donation';
import type { Event } from '../models/event';

export interface TenantSettlementData {
  events: Event[];
  donations: Donation[];
}

/**
 * Story 8.5: a fresh server read of the tenant's Events and every Donation on them, taken at
 * export time so the sheet matches the live totals. An organizer-tier member already holds
 * read on these rows (AD-2, 2026-09-30 amendment), and row security keeps other tenants' rows
 * out. Online-only on purpose: nothing is cached to Dexie, so an export can never be built
 * from a stale local copy.
 */
@Injectable({ providedIn: 'root' })
export class SettlementDataService {
  private readonly databases = inject(DATABASES);
  private readonly organizerEvents = inject(OrganizerEventDataService);

  async loadTenantSettlementData(tenantId: string): Promise<TenantSettlementData> {
    const events = await this.organizerEvents.listTenantEvents(tenantId);
    try {
      const eventIds = events.map((event) => event.id);
      const rows = await listDonationRowsForEvents(this.databases, eventIds);
      return { events, donations: rows.map(rowToSettlementDonation) };
    } catch (error) {
      throw new ServiceError("We couldn't load your donations", error);
    }
  }
}

/** Only the fields a settlement total needs — donor phone and notes never enter this path. */
function rowToSettlementDonation(row: Models.DefaultRow): Donation {
  return {
    id: row.$id,
    eventId: row['eventId'],
    receiptNumber: row['receiptNumber'],
    donorName: row['donorName'],
    amountMinor: row['amountMinor'] ?? null,
    donationType: row['donationType'],
    recordedBy: row['recordedBy'],
    recordedAt: row['recordedAt'],
    syncStatus: row['syncStatus'] ?? 'synced',
    deletedAt: row['deletedAt'] ?? null,
  };
}
