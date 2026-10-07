import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DONATION_TYPE_LABELS } from '../../../../../data/models/donation';
import {
  DONATION_TYPE_FILTERS,
  type DonationFilters,
  type DonationTypeFilter,
} from '../../../../../utils/donation-filter.util';

export interface FilterOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Search, type and recorder filters for a company donation list, plus an event choice when
 * `events` lists more than one. Two-way bound: the page owns the filters signal.
 */
@Component({
  selector: 'app-donation-filter-bar',
  imports: [MatIconModule],
  templateUrl: './donation-filter-bar.html',
  styleUrl: './donation-filter-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationFilterBar {
  public readonly filters = model.required<DonationFilters>();
  public readonly recorders = input<readonly FilterOption[]>([]);
  public readonly events = input<readonly FilterOption[]>([]);

  public readonly types = DONATION_TYPE_FILTERS;
  public readonly labels = DONATION_TYPE_LABELS;

  public typeLabel(type: DonationTypeFilter): string {
    return type === 'all' ? 'All types' : this.labels[type];
  }

  public setSearch(search: string): void {
    this.filters.update((f) => ({ ...f, search }));
  }

  public setType(type: DonationTypeFilter): void {
    this.filters.update((f) => ({ ...f, type }));
  }

  public setRecorder(recorder: string): void {
    this.filters.update((f) => ({ ...f, recorder }));
  }

  public setEvent(eventId: string): void {
    this.filters.update((f) => ({ ...f, eventId: eventId === 'all' ? null : eventId }));
  }
}
