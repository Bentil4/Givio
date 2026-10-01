import { Injectable, inject } from '@angular/core';
import { Models, Query } from 'appwrite';
import { DATABASES } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { environment } from '../../../environments/environment';
import { OrganizerEventDataService } from './organizer-event-data.service';
import type { Donation } from '../models/donation';
import type { Event } from '../models/event';

export interface TenantSettlementData {
  events: Event[];
  donations: Donation[];
}

const PAGE_SIZE = 100;
/** Appwrite caps the values a single Query.equal may carry at 100. */
const EVENT_IDS_PER_QUERY = 100;

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
      const donations = await this.fetchDonationsForEvents(events.map((event) => event.id));
      return { events, donations };
    } catch (error) {
      throw new ServiceError("We couldn't load your donations", error);
    }
  }

  private async fetchDonationsForEvents(eventIds: string[]): Promise<Donation[]> {
    const batches = chunk(eventIds, EVENT_IDS_PER_QUERY);
    const pages = await Promise.all(batches.map((ids) => this.fetchDonationRows(ids)));
    return pages.flat();
  }

  private async fetchDonationRows(eventIds: string[]): Promise<Donation[]> {
    const donations: Donation[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.databases.listRows<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.donationsCollectionId,
        queries: donationQueries(eventIds, cursor),
      });
      donations.push(...page.rows.map(rowToSettlementDonation));
      if (page.rows.length < PAGE_SIZE) {
        return donations;
      }
      cursor = page.rows[page.rows.length - 1].$id;
    }
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

function donationQueries(eventIds: string[], cursor: string | undefined): string[] {
  const queries = [Query.equal('eventId', eventIds), Query.limit(PAGE_SIZE)];
  return cursor ? [...queries, Query.cursorAfter(cursor)] : queries;
}

/**
 * Only the fields a settlement total needs — donor phone and notes never enter this path.
 * DonationDataService's own mapper is private and that file is frozen for a parallel story.
 */
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
