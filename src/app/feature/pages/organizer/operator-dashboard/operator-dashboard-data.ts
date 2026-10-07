import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { Donation } from '../../../../data/models/donation';
import { DonationDataService } from '../../../../data/services/donation-data.service';
import { DonationService } from '../../../../data/services/donation.service';
import type { OperatorDataState } from './operator-insights.util';

/**
 * The donations of the Events the Operator's dashboard is looking at, kept in its own signal so
 * reading several Events never overwrites DonationService.donations, which the desk and the
 * donation list show for the one picked Event. Reads go through the Dexie cache, so the
 * dashboard still has figures offline, and a Realtime push refetches them in place.
 * Provided by OperatorDashboard, so it lives exactly as long as the page.
 */
@Injectable()
export class OperatorDashboardData {
  private readonly donationDataService = inject(DonationDataService);
  private readonly donationService = inject(DonationService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _donations = signal<readonly Donation[]>([]);
  private readonly _state = signal<OperatorDataState>('loading');
  private eventIds: readonly string[] = [];
  private latestRequest = 0;
  private destroyed = false;

  public readonly donations = this._donations.asReadonly();
  public readonly state = this._state.asReadonly();

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));
    void this.refetchOnRealtimeChanges();
  }

  /** Shows the loading state, then the donations of `eventIds`. */
  async load(eventIds: readonly string[]): Promise<void> {
    this.eventIds = eventIds;
    this._state.set('loading');
    await this.fetchDonations();
  }

  public retry(): Promise<void> {
    return this.load(this.eventIds);
  }

  // Only the newest request may write, so a slow read for a previous scope can't land last.
  private async fetchDonations(): Promise<void> {
    const request = ++this.latestRequest;
    try {
      const donations = await this.readDonations(this.eventIds);
      if (request === this.latestRequest) this.showDonations(donations);
    } catch {
      if (request === this.latestRequest) this._state.set('error');
    }
  }

  private async readDonations(eventIds: readonly string[]): Promise<Donation[]> {
    const perEvent = await Promise.all(
      eventIds.map((id) => this.donationDataService.listDonationsForEvent(id)),
    );
    return perEvent.flat();
  }

  private showDonations(donations: readonly Donation[]): void {
    this._donations.set(donations);
    this._state.set('ready');
  }

  // A live push only refreshes the figures in place — no skeleton flash while recording.
  private async refetchOnRealtimeChanges(): Promise<void> {
    try {
      const close = await this.donationService.subscribeToChanges(() => {
        void this.fetchDonations();
      });
      this.closeWhenDestroyed(close);
    } catch {
      // No Realtime (offline): the figures still refresh on every load and retry.
    }
  }

  private closeWhenDestroyed(close: () => void): void {
    if (this.destroyed) {
      close();
      return;
    }
    this.destroyRef.onDestroy(close);
  }
}
