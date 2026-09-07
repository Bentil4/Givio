import { Injectable, inject } from '@angular/core';
import { Models, Query } from 'appwrite';
import { DATABASES, FUNCTIONS } from '../appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { appDb } from '../dexie/app-db';
import { ServiceError } from './service-error';
import type { ConflictPair, ConflictResolution, Donation } from '../models/donation';
import { environment } from '../../../environments/environment';

function rowToConflictPair(row: Models.DefaultRow): ConflictPair {
  return {
    receiptNumber: row['receiptNumber'],
    local: JSON.parse(row['localVersion']) as Donation,
    server: JSON.parse(row['serverVersion']) as Donation,
    detectedAt: row['detectedAt'],
  };
}

interface ResolveConflictResult {
  success: boolean;
  resolution: ConflictResolution;
  /** keep-local/keep-server: the (only) surviving row. keep-both: the newly-created 2nd row. */
  donation: Donation;
  /** keep-both only: the original row, left as the server version under its original id. */
  serverDonation?: Donation;
}

@Injectable({ providedIn: 'root' })
export class ConflictDataService {
  private readonly databases = inject(DATABASES);
  private readonly functions = inject(FUNCTIONS);

  /**
   * Admin-only, read-only, no offline support — same shape as AuditLogDataService: the
   * conflict queue is a live server view, not part of the offline-first event/donation flow.
   */
  async listConflicts(): Promise<ConflictPair[]> {
    const PAGE_SIZE = 100;
    const pairs: ConflictPair[] = [];
    let cursor: string | undefined;

    for (;;) {
      const queries = [Query.isNull('resolvedAt'), Query.limit(PAGE_SIZE)];
      if (cursor) queries.push(Query.cursorAfter(cursor));

      const page = await this.databases.listRows<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.donationConflictsCollectionId,
        queries,
      });

      pairs.push(...page.rows.map(rowToConflictPair));
      if (page.rows.length < PAGE_SIZE) break;
      cursor = page.rows[page.rows.length - 1].$id;
    }

    return pairs;
  }

  /**
   * Admin-only. Looks up the unresolved conflict row by receiptNumber (the identifier the
   * ConflictPair/ConflictResolver UI already works with — there's at most one active conflict
   * per receipt at a time in practice), then calls the Function to apply the resolution.
   * Returns the resulting Donation so the caller can refresh its local Dexie copy.
   */
  async resolveConflict(receiptNumber: string, resolution: ConflictResolution): Promise<Donation> {
    const page = await this.databases.listRows<Models.DefaultRow>({
      databaseId: environment.appwriteDatabaseId,
      tableId: environment.donationConflictsCollectionId,
      queries: [Query.equal('receiptNumber', receiptNumber), Query.isNull('resolvedAt'), Query.limit(1)],
    });
    const conflictRow = page.rows[0];
    if (!conflictRow) {
      throw new ServiceError('Conflict not found');
    }

    const result = await invokeAdminFunction<ResolveConflictResult>(
      this.functions,
      'resolveConflict',
      'Failed to resolve conflict',
      { conflictId: conflictRow.$id, resolution },
    );

    await appDb.donations.put(result.donation);
    // keep-both is the only resolution where donation/serverDonation are two different rows
    // (a fresh duplicate plus the untouched original) — keep-local/keep-server both describe
    // the same single row, and serverDonation there is the pre-resolution (stale) version.
    if (resolution === 'keep-both' && result.serverDonation) {
      await appDb.donations.put(result.serverDonation);
    }
    return result.donation;
  }
}
