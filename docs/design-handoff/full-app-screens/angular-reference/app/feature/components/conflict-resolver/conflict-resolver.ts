import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ConflictPair, ConflictResolution, Donation, DONATION_TYPE_LABELS, formatCedis } from '../../../data/models/donation';

interface ComparisonRow {
  label: string;
  local: string;
  server: string;
  differs: boolean;
}

/**
 * Two versions of one donation, side by side, resolved by a human.
 *
 * Deliberately NOT last-write-wins. The device clock on a tablet at a funeral is not
 * trustworthy, and the "loser" of an automatic merge is somebody's GH₵ 750 gift. Both
 * versions are kept until an Admin chooses, and the record is excluded from every total
 * in the meantime so no report is ever quietly wrong.
 */
@Component({
  selector: 'app-conflict-resolver',
  templateUrl: './conflict-resolver.html',
  styleUrl: './conflict-resolver.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConflictResolver {
  public conflict = input.required<ConflictPair>();
  public busy = input(false);
  public resolved = output<ConflictResolution>();

  public rows = computed<ComparisonRow[]>(() => {
    const { local, server } = this.conflict();
    const build = (label: string, pick: (d: Donation) => string): ComparisonRow => {
      const a = pick(local);
      const b = pick(server);
      return { label, local: a, server: b, differs: a !== b };
    };

    return [
      build('Donor', (d) => d.donorName),
      build('Amount', (d) => formatCedis(d.amountMinor)),
      build('Type', (d) => DONATION_TYPE_LABELS[d.donationType]),
      build('On behalf of', (d) => d.onBehalfOf || '—'),
      build('Recorded by', (d) => d.recordedBy + (d.deskLabel ? ` · ${d.deskLabel}` : '')),
      build('Saved at', (d) => d.recordedAt),
    ];
  });

  public bothReceipt = computed(() => this.conflict().receiptNumber + '-B');
}
