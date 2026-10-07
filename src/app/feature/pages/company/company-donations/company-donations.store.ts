import { Injectable, computed, inject, signal } from '@angular/core';
import { CompanyDonationDataService } from '../../../../data/services/company-donation-data.service';
import { OrganizerEventDataService } from '../../../../data/services/organizer-event-data.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import { ServiceError } from '../../../../core/services/service-error';
import type { Donation, DonationCorrection } from '../../../../data/models/donation';
import type { Event } from '../../../../data/models/event';
import type { TeamMember } from '../../../../data/models/team-member';

// Admin, or someone who was never on this team, recorded it — a tenant isn't told who.
const NOT_ON_TEAM = 'Not on your team';

/**
 * The company's Events and their donations, shared by the event detail page and the
 * Donations page (provided per page, so each visit reads fresh). Read straight from Appwrite,
 * online-only. Recorders are named from the team list including revoked members (FR-13); a
 * failed name lookup only leaves names unresolved, never the page empty.
 */
@Injectable()
export class CompanyDonationsStore {
  private readonly eventData = inject(OrganizerEventDataService);
  private readonly donationData = inject(CompanyDonationDataService);
  private readonly teamData = inject(TeamDataService);
  private readonly tenantService = inject(TenantService);

  private readonly _events = signal<readonly Event[]>([]);
  private readonly _donations = signal<readonly Donation[]>([]);
  private readonly _membersById = signal<ReadonlyMap<string, TeamMember>>(new Map());
  private readonly _loading = signal(true);
  private readonly _loadError = signal<string | null>(null);

  public readonly events = this._events.asReadonly();
  public readonly donations = this._donations.asReadonly();
  public readonly membersById = this._membersById.asReadonly();
  public readonly loading = this._loading.asReadonly();
  public readonly loadError = this._loadError.asReadonly();
  /** Only the Super Organizer corrects, removes, restores and resolves (the Function agrees). */
  public readonly canManage = computed(
    () => this.tenantService.context()?.membership.role === 'super_organizer',
  );

  /** Every Event of the company, and the donations on `eventIds` (all of them when omitted). */
  async load(eventIds?: readonly string[]): Promise<void> {
    this._loading.set(true);
    void this.loadRecorderNames();
    try {
      const events = await this.eventData.listTenantEvents(this.tenantId());
      this._events.set(events);
      const scope = eventIds ?? events.map((event) => event.id);
      this._donations.set(await this.donationData.listDonationsForEvents(scope));
      this._loadError.set(null);
    } catch (err) {
      this._loadError.set(err instanceof ServiceError ? err.message : "We couldn't load donations");
    } finally {
      this._loading.set(false);
    }
  }

  /** A quiet refetch of every Event's donations — after a conflict resolution, say. */
  async reloadAllDonations(): Promise<void> {
    const eventIds = this._events().map((event) => event.id);
    this._donations.set(await this.donationData.listDonationsForEvents(eventIds));
  }

  public recorderName(userId: string): string {
    return this._membersById().get(userId)?.name ?? NOT_ON_TEAM;
  }

  async correctDonation(id: string, patch: DonationCorrection, reason: string): Promise<void> {
    this.replaceDonation(await this.donationData.editDonation(id, patch, reason));
  }

  async removeDonation(donationId: string, reason: string): Promise<void> {
    this.replaceDonation(await this.donationData.softDeleteDonation(donationId, reason));
  }

  async restoreDonation(donationId: string): Promise<void> {
    this.replaceDonation(await this.donationData.restoreDonation(donationId));
  }

  private replaceDonation(donation: Donation): void {
    this._donations.update((list) => list.map((d) => (d.id === donation.id ? donation : d)));
  }

  private async loadRecorderNames(): Promise<void> {
    try {
      const members = await this.teamData.listTeamMembersIncludingRevoked();
      this._membersById.set(new Map(members.map((m) => [m.userId, m])));
    } catch {
      this._membersById.set(new Map());
    }
  }

  private tenantId(): string {
    const tenantId = this.tenantService.context()?.membership.tenantId;
    if (!tenantId) {
      throw new ServiceError("We couldn't find your company");
    }
    return tenantId;
  }
}
