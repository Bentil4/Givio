import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Donation, DonationType, DONATION_TYPE_LABELS, formatCedis, formatCedisShort, totalMinor } from '../../../../data/models/donation';

type Tab = 'all' | 'mine' | 'pending' | DonationType;

/**
 * The operator's own donation list. A read-only companion to the desk — no edit, no delete.
 * Corrections are an Admin action, and an operator who could quietly change an amount they
 * already read back to a donor is the whole reason the audit trail exists.
 *
 * Deliberately NOT the admin table: no donor phone column, and the "Mine" tab is the default
 * because the question an operator actually has is "did my last entry save?".
 */
@Component({
  selector: 'app-operator-donations',
  imports: [MatIconModule, RouterLink],
  templateUrl: './operator-donations.html',
  styleUrl: './operator-donations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperatorDonations {
  // ── replace with service-backed signals ──────────────────────────────
  public readonly donations = signal<readonly Donation[]>([]);
  public readonly loading = signal(true);
  public readonly eventName = signal('');
  public readonly currentUser = signal('');
  public readonly online = signal(true);
  // ─────────────────────────────────────────────────────────────────────

  public readonly tab = signal<Tab>('mine');
  public readonly search = signal('');

  public readonly labels = DONATION_TYPE_LABELS;
  public readonly skeletons = Array.from({ length: 8 }, (_, i) => i);

  private readonly mine = computed(() =>
    this.donations().filter((d) => d.recordedBy === this.currentUser()),
  );

  private readonly pending = computed(() =>
    this.donations().filter((d) => d.syncStatus !== 'synced'),
  );

  public readonly tabs = computed(() => [
    { key: 'mine' as Tab, label: 'Mine', count: this.mine().length },
    { key: 'all' as Tab, label: 'All desks', count: this.donations().length },
    { key: 'pending' as Tab, label: 'Pending', count: this.pending().length },
    { key: 'cash' as Tab, label: 'Cash', count: this.byType('cash').length },
    { key: 'mobile_money' as Tab, label: 'MoMo', count: this.byType('mobile_money').length },
  ]);

  private byType(type: DonationType): readonly Donation[] {
    return this.donations().filter((d) => d.donationType === type);
  }

  public readonly visible = computed(() => {
    const t = this.tab();
    const needle = this.search().trim().toLowerCase();

    let rows: readonly Donation[];
    switch (t) {
      case 'mine': rows = this.mine(); break;
      case 'pending': rows = this.pending(); break;
      case 'all': rows = this.donations(); break;
      default: rows = this.byType(t);
    }

    rows = rows.filter((d) => !d.deletedAt);

    if (needle) {
      rows = rows.filter((d) =>
        (d.donorName + ' ' + d.receiptNumber).toLowerCase().includes(needle),
      );
    }
    return rows;
  });

  public readonly isEmpty = computed(() => !this.loading() && this.visible().length === 0);
  public readonly searching = computed(() => !!this.search().trim());

  public readonly myTotalLabel = computed(() => formatCedis(totalMinor(this.mine())));
  public readonly eventTotalLabel = computed(() => formatCedisShort(totalMinor(this.donations())));

  public readonly pendingNote = computed(() => {
    const n = this.pending().length;
    if (n === 0) return null;
    return n === 1
      ? '1 donation is still waiting to sync. It is safe on this device.'
      : `${n} donations are still waiting to sync. They are safe on this device.`;
  });

  public readonly emptyCopy = computed(() => {
    if (this.searching()) {
      return {
        title: 'Nothing matches that search',
        body: 'Try part of the donor\u2019s name, or a receipt number.',
      };
    }
    switch (this.tab()) {
      case 'pending':
        return {
          title: 'Everything has synced',
          body: 'No donations are waiting on this device — the server has all of them.',
        };
      case 'mine':
        return {
          title: 'You have not recorded any yet',
          body: 'Entries you save at the desk appear here straight away, synced or not.',
        };
      default:
        return {
          title: 'No donations yet',
          body: 'The first entry from any desk will show up here.',
        };
    }
  });

  public amountLabel(d: Donation): string { return formatCedis(d.amountMinor); }

  public isPending(d: Donation): boolean { return d.syncStatus !== 'synced'; }

  public statusLabel(d: Donation): string {
    switch (d.syncStatus) {
      case 'synced': return 'Synced';
      case 'conflict': return 'Needs Admin';
      case 'failed': return 'Retrying';
      default: return 'Pending';
    }
  }

  public statusChip(d: Donation): string {
    switch (d.syncStatus) {
      case 'synced': return 'tag-success';
      case 'conflict': return 'tag-error';
      default: return 'tag-default';
    }
  }

  public setTab(t: Tab): void { this.tab.set(t); }
  public setSearch(v: string): void { this.search.set(v); }
  public clearSearch(): void { this.search.set(''); }
}
