import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ConflictPair, ConflictResolution, Donation, DONATION_TYPE_LABELS } from '../../../data/models/donation';
import type { AdminUser } from '../../../data/models/admin-user';
import { formatCedis } from '../../../utils/donation.util';
import { formatUserDisplay } from '../../../utils/user-display.util';

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
  imports: [DatePipe],
  // DatePipe has no `providedIn: 'root'` — needed explicitly so inject(DatePipe) below can
  // format the 'Saved at' row's value in TS, not just via the template pipe.
  providers: [DatePipe],
  templateUrl: './conflict-resolver.html',
  styleUrl: './conflict-resolver.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConflictResolver {
  private readonly datePipe = inject(DatePipe);

  public conflict = input.required<ConflictPair>();
  public busy = input(false);
  /** id→AdminUser lookup, supplied by the parent (AdminConflicts) — kept a presentational
   *  input rather than injecting UserService here, so this component stays a dumb view. */
  public users = input<ReadonlyMap<string, AdminUser>>(new Map());
  public resolved = output<ConflictResolution>();

  public rows = computed<ComparisonRow[]>(() => {
    const { local, server } = this.conflict();
    const users = this.users();
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
      build(
        'Recorded by',
        (d) => formatUserDisplay(users.get(d.recordedBy), d.recordedBy) + (d.deskLabel ? ` · ${d.deskLabel}` : ''),
      ),
      build('Saved at', (d) => this.datePipe.transform(d.recordedAt, 'MMM d, y, h:mm a') ?? d.recordedAt),
    ];
  });

  public bothReceipt = computed(() => this.conflict().receiptNumber + '-B');
}
