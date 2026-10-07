import type { Donation, DonationType } from '../data/models/donation';

export type DonationTypeFilter = DonationType | 'all';

/** What a donation list is narrowed by. `recorder` is a user id, or 'all'. */
export interface DonationFilters {
  eventId: string | null;
  type: DonationTypeFilter;
  recorder: string;
  search: string;
}

export const NO_DONATION_FILTERS: DonationFilters = {
  eventId: null,
  type: 'all',
  recorder: 'all',
  search: '',
};

export const DONATION_TYPE_FILTERS: readonly DonationTypeFilter[] = [
  'all',
  'cash',
  'mobile_money',
  'in_kind',
];

/** The donations matching every filter. Search matches the donor name or receipt number. */
export function filterDonations<T extends Donation>(
  donations: readonly T[],
  filters: DonationFilters,
): T[] {
  const needle = filters.search.trim().toLowerCase();
  return donations.filter(
    (d) =>
      matchesEvent(d, filters.eventId) &&
      matchesType(d, filters.type) &&
      matchesRecorder(d, filters.recorder) &&
      matchesSearch(d, needle),
  );
}

/** Whether type, recorder or search narrow the list — the event choice is a scope, not a filter. */
export function hasNarrowingFilters(filters: DonationFilters): boolean {
  return filters.type !== 'all' || filters.recorder !== 'all' || filters.search.trim() !== '';
}

/** Everyone who recorded at least one of these donations, in first-seen order. */
export function distinctRecorders(donations: readonly Donation[]): string[] {
  return [...new Set(donations.map((d) => d.recordedBy))];
}

function matchesEvent(donation: Donation, eventId: string | null): boolean {
  return eventId === null || donation.eventId === eventId;
}

function matchesType(donation: Donation, type: DonationTypeFilter): boolean {
  return type === 'all' || donation.donationType === type;
}

function matchesRecorder(donation: Donation, recorder: string): boolean {
  return recorder === 'all' || donation.recordedBy === recorder;
}

function matchesSearch(donation: Donation, needle: string): boolean {
  const haystack = `${donation.donorName} ${donation.receiptNumber}`.toLowerCase();
  return needle === '' || haystack.includes(needle);
}
