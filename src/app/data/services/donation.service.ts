import { Injectable, inject, signal } from '@angular/core';
import { DonationDataService } from './donation-data.service';
import type { Donation, DonationDraft } from '../models/donation';

@Injectable({ providedIn: 'root' })
export class DonationService {
  private readonly donationDataService = inject(DonationDataService);
  private readonly _donations = signal<Donation[]>([]);

  public readonly donations = this._donations.asReadonly();

  async loadDonationsForEvent(eventId: string): Promise<void> {
    this._donations.set(await this.donationDataService.listDonationsForEvent(eventId));
  }

  async createDonation(draft: DonationDraft): Promise<Donation> {
    const donation = await this.donationDataService.createDonation(draft);
    this._donations.update((donations) => [donation, ...donations]);
    return donation;
  }
}
