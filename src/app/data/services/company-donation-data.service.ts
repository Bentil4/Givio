import { Injectable, inject } from '@angular/core';
import type { Models } from 'appwrite';
import { DATABASES, FUNCTIONS } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import { listDonationRowsForEvents } from '../appwrite/donation-rows-for-events';
import { rowToDonation } from '../appwrite/donation-row';
import type { Donation, DonationCorrection } from '../models/donation';

/**
 * A company's donations, for its Super Organizer and co-Organizers: every field, read straight
 * from Appwrite — organizer-tier members hold row read on their tenant's Events and Donations
 * (AD-2), and row security keeps other tenants' rows out. Online-only like the rest of the
 * Organizer tier: nothing touches the Dexie cache or outbox, which belong to the desk.
 *
 * Corrections go through the Function, which only lets the tenant's Super Organizer make them
 * and keeps each row's permissions exactly as recorded.
 */
@Injectable({ providedIn: 'root' })
export class CompanyDonationDataService {
  private readonly databases = inject(DATABASES);
  private readonly functions = inject(FUNCTIONS);

  async listDonationsForEvents(eventIds: readonly string[]): Promise<Donation[]> {
    try {
      const rows = await listDonationRowsForEvents(this.databases, eventIds);
      return rows.map(rowToDonation);
    } catch (error) {
      throw new ServiceError("We couldn't load the donations", error);
    }
  }

  async editDonation(
    donationId: string,
    patch: DonationCorrection,
    reason: string,
  ): Promise<Donation> {
    return this.callDonationFunction({
      action: 'editTenantDonation',
      failureMessage: "We couldn't save the correction",
      payload: { donationId, patch, reason },
    });
  }

  async softDeleteDonation(donationId: string, reason: string): Promise<Donation> {
    return this.callDonationFunction({
      action: 'softDeleteTenantDonation',
      failureMessage: "We couldn't remove the donation",
      payload: { donationId, reason },
    });
  }

  async restoreDonation(donationId: string): Promise<Donation> {
    return this.callDonationFunction({
      action: 'restoreTenantDonation',
      failureMessage: "We couldn't restore the donation",
      payload: { donationId },
    });
  }

  /** The one call site into the Function for this service. */
  private async callDonationFunction(call: {
    action: string;
    failureMessage: string;
    payload: object;
  }): Promise<Donation> {
    const { donation } = await invokeAdminFunction<{ donation: Models.DefaultRow }>(
      this.functions,
      { action: call.action, invokeFailureMessage: call.failureMessage, payload: call.payload },
    );
    return rowToDonation(donation);
  }
}
