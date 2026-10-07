import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { Donation } from '../../../../../data/models/donation';
import { formatCedis, totalMinor } from '../../../../../utils/donation.util';
import {
  NO_DONATION_FILTERS,
  distinctRecorders,
  filterDonations,
  hasNarrowingFilters,
} from '../../../../../utils/donation-filter.util';
import { CompanyDonationsStore } from '../company-donations.store';
import { DonationFilterBar, type FilterOption } from '../donation-filter-bar/donation-filter-bar';
import { DonationList } from '../donation-list/donation-list';
import {
  DonationActionDialogs,
  type DonationAction,
} from '../donation-dialogs/donation-action-dialogs';

/**
 * Filters, the filtered list and its running total, and the correction dialogs — the part the
 * event detail page and the Donations page share. `donations` are the live (not deleted) ones
 * already in scope; `eventOptions` adds an event filter when there's more than one Event.
 */
@Component({
  selector: 'app-donation-browser',
  imports: [MatIconModule, DonationFilterBar, DonationList, DonationActionDialogs],
  templateUrl: './donation-browser.html',
  styleUrl: './donation-browser.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationBrowser {
  private readonly store = inject(CompanyDonationsStore);

  public readonly donations = input.required<readonly Donation[]>();
  public readonly eventOptions = input<readonly FilterOption[]>([]);

  public readonly filters = signal(NO_DONATION_FILTERS);
  public readonly action = signal<DonationAction | null>(null);

  public readonly visible = computed(() => filterDonations(this.donations(), this.filters()));
  public readonly totalLabel = computed(() => formatCedis(totalMinor(this.visible())));
  public readonly recorders = computed<FilterOption[]>(() =>
    distinctRecorders(this.donations()).map((id) => ({
      id,
      label: this.store.recorderName(id),
    })),
  );
  public readonly narrowed = computed(
    () => hasNarrowingFilters(this.filters()) || this.filters().eventId !== null,
  );

  public clearFilters(): void {
    this.filters.set(NO_DONATION_FILTERS);
  }
}
