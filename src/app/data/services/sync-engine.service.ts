import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { appDb } from '../dexie/app-db';
import type { OutboxEntry } from '../models/outbox-entry';
import { ConnectivityService } from '../../core/services/connectivity.service';
import { EventDataService } from './event-data.service';
import { DonationDataService } from './donation-data.service';

/**
 * Story 3.5: drains the per-entity outbox automatically once connectivity returns, and
 * exposes the pending count for the badge every screen shows. Injected once from the app
 * root (see app.ts) so it's alive for the whole session — a `providedIn: 'root'` singleton
 * is otherwise only constructed lazily, on first injection, and nothing else in the app
 * would ever trigger that construction on its own.
 */
@Injectable({ providedIn: 'root' })
export class SyncEngineService {
  private readonly connectivityService = inject(ConnectivityService);
  private readonly eventDataService = inject(EventDataService);
  private readonly donationDataService = inject(DonationDataService);

  private readonly _pendingCount = signal(0);
  private readonly _syncing = signal(false);

  public readonly pendingCount = this._pendingCount.asReadonly();
  public readonly syncing = this._syncing.asReadonly();

  private wasOffline = !this.connectivityService.online();

  constructor() {
    void this.refreshPendingCount();

    // AC: "begins draining... within 5 seconds" — there's no reason to wait once the
    // ConnectivityService (navigator.onLine + events) has already told us we're back.
    effect(() => {
      const online = this.connectivityService.online();
      if (online && this.wasOffline) {
        void this.drainOutbox();
      }
      this.wasOffline = !online;
    });

    // The badge needs to reflect a new item the moment it's queued (e.g. a donation saved
    // while already offline), not just after the next drain — cheap enough to poll rather
    // than thread a "notify the sync engine" call through every mutation call site.
    const poll = setInterval(() => void this.refreshPendingCount(), 3000);
    inject(DestroyRef).onDestroy(() => clearInterval(poll));
  }

  /** Server-rejected ('failed') entries aren't waiting on anything, so they aren't pending. */
  async refreshPendingCount(): Promise<void> {
    this._pendingCount.set(await appDb.outbox.where('status').notEqual('failed').count());
  }

  /** The pending queue's "Dismiss" on a server-rejected donation. */
  async dismissRejected(localId: number): Promise<void> {
    await this.donationDataService.dismissRejected(localId);
    await this.refreshPendingCount();
  }

  /** Also the "Retry Sync" manual trigger — draining is the same operation either way. */
  async drainOutbox(): Promise<void> {
    if (this._syncing()) return;
    this._syncing.set(true);
    try {
      // Insertion order (Dexie's default for an auto-incrementing primary key) is the
      // per-entity FIFO order AD-4 calls for.
      // Rejected entries are skipped: the server would refuse the same payload again.
      const entries = (await appDb.outbox.toArray()).filter((e) => e.status !== 'failed');
      for (const entry of entries) {
        await this.retryWithOwningDataService(entry);
      }
    } finally {
      await this.refreshPendingCount();
      this._syncing.set(false);
    }
  }

  private async retryWithOwningDataService(entry: OutboxEntry): Promise<void> {
    if (entry.entityType === 'event') {
      await this.eventDataService.retryOutboxEntry(entry);
    } else {
      await this.donationDataService.retryOutboxEntry(entry);
    }
  }
}
