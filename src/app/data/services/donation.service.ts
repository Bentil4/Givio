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

  async loadAllDonations(): Promise<void> {
    this._donations.set(await this.donationDataService.listAllDonations());
  }

  async createDonation(draft: DonationDraft): Promise<Donation> {
    const donation = await this.donationDataService.createDonation(draft);
    this._donations.update((donations) => [donation, ...donations]);
    return donation;
  }

  async updateDonation(
    id: string,
    patch: Parameters<DonationDataService['updateDonation']>[1],
    reason: string,
  ): Promise<Donation> {
    const donation = await this.donationDataService.updateDonation(id, patch, reason);
    this._donations.update((donations) => donations.map((d) => (d.id === id ? donation : d)));
    return donation;
  }

  async softDeleteDonation(id: string, reason: string): Promise<Donation> {
    const donation = await this.donationDataService.softDeleteDonation(id, reason);
    this._donations.update((donations) => donations.map((d) => (d.id === id ? donation : d)));
    return donation;
  }

  async recoverDonation(id: string): Promise<Donation> {
    const donation = await this.donationDataService.recoverDonation(id);
    this._donations.update((donations) => donations.map((d) => (d.id === id ? donation : d)));
    return donation;
  }
}
