import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SkeletonRows } from '../../../../shared/components/skeleton-rows/skeleton-rows';
import { tabIndexForKey } from '../../../../utils/tabs.util';
import { CompanyDonationsStore } from './company-donations.store';
import { DonationBrowser } from './donation-browser/donation-browser';
import { DeletedDonations } from './deleted-donations/deleted-donations';
import { DonationConflicts } from './donation-conflicts/donation-conflicts';
import type { FilterOption } from './donation-filter-bar/donation-filter-bar';

export type DonationsTab = 'all' | 'deleted' | 'conflicts';

interface TabDef {
  readonly id: DonationsTab;
  readonly label: string;
}

const ALL_TAB: TabDef = { id: 'all', label: 'All' };
const DELETED_TAB: TabDef = { id: 'deleted', label: 'Deleted' };
const CONFLICTS_TAB: TabDef = { id: 'conflicts', label: 'Sync conflicts' };

/**
 * /company/donations: every donation across the company's Events, filterable by event, type,
 * recorder and search; the removed ones; and — for the Super Organizer, who resolves them —
 * the sync conflicts. Sections are tabs in component state, not child routes.
 */
@Component({
  selector: 'app-company-donations',
  imports: [MatIconModule, SkeletonRows, DonationBrowser, DeletedDonations, DonationConflicts],
  providers: [CompanyDonationsStore],
  templateUrl: './company-donations.html',
  styleUrl: './company-donations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyDonations implements OnInit {
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  protected readonly store = inject(CompanyDonationsStore);

  public readonly activeTab = signal<DonationsTab>('all');
  public readonly tabs = computed<readonly TabDef[]>(() =>
    this.store.canManage() ? [ALL_TAB, DELETED_TAB, CONFLICTS_TAB] : [ALL_TAB, DELETED_TAB],
  );
  public readonly liveDonations = computed(() =>
    this.store.donations().filter((d) => !d.deletedAt),
  );
  public readonly deletedDonations = computed(() =>
    this.store.donations().filter((d) => !!d.deletedAt),
  );
  public readonly eventOptions = computed<FilterOption[]>(() =>
    this.store.events().map((event) => ({ id: event.id, label: event.name })),
  );

  ngOnInit(): void {
    void this.load();
  }

  public load(): Promise<void> {
    return this.store.load();
  }

  public selectTab(tab: DonationsTab): void {
    this.activeTab.set(tab);
  }

  public onTabKeydown(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    const next = tabIndexForKey(event.key, index, tabs.length);
    if (next === undefined) return;
    event.preventDefault();
    this.selectTab(tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }
}
