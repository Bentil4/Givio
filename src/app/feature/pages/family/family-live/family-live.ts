import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DonationRow } from '../../../components/donation-row/donation-row';
import { Donation, DonationType, formatCedis, formatCedisShort, totalMinor } from '../../../../data/models/donation';
import { DonationEvent } from '../../../../data/models/donation-event';

interface Slice {
  type: DonationType;
  label: string;
  valueLabel: string;
  percent: number;
}

/**
 * The family's read-only live view, reached with an event code and no account.
 *
 * Two rules govern this screen and both are enforced on the server, not here:
 *   1. the payload contains no donorPhone, no recordedBy and no internal notes;
 *   2. the Realtime subscription is scoped to this one event id.
 * A client-side filter would put the phone numbers in the DOM of a page shared over
 * WhatsApp to a hundred relatives.
 */
@Component({
  selector: 'app-family-live',
  imports: [MatIconModule, DonationRow],
  templateUrl: './family-live.html',
  styleUrl: './family-live.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilyLive {
  // ── replace with service-backed signals ──────────────────────────────
  public readonly event = signal<DonationEvent | null>(null);
  public readonly donations = signal<readonly Donation[]>([]);
  public readonly loading = signal(true);
  public readonly connected = signal(true);
  public readonly lastUpdated = signal<string>('just now');
  // ─────────────────────────────────────────────────────────────────────

  public readonly exportOpen = signal(false);

  public readonly totalLabel = computed(() => formatCedisShort(totalMinor(this.donations())));
  public readonly donorCount = computed(() => this.donations().length);
  public readonly isEmpty = computed(() => !this.loading() && this.donations().length === 0);

  /** Skeleton rows. Eight matches the real list's first paint, so nothing shifts on load. */
  public readonly skeletons = Array.from({ length: 8 }, (_, i) => i);

  public readonly slices = computed<Slice[]>(() => {
    const total = totalMinor(this.donations());
    const byType: Record<DonationType, number> = { cash: 0, mobile_money: 0, in_kind: 0 };
    for (const d of this.donations()) {
      if (d.deletedAt || d.syncStatus === 'conflict') continue;
      byType[d.donationType] += d.amountMinor ?? 0;
    }
    const labels: Record<DonationType, string> = {
      cash: 'Cash',
      mobile_money: 'Mobile Money',
      in_kind: 'In-Kind (est.)',
    };
    return (Object.keys(byType) as DonationType[]).map((type) => ({
      type,
      label: labels[type],
      valueLabel: formatCedis(byType[type]),
      percent: total > 0 ? Math.round((byType[type] / total) * 100) : 0,
    }));
  });

  /** Every column the export will contain, and — explicitly — the ones it will not. */
  public readonly exportColumns = [
    { label: 'Donor name', included: true },
    { label: 'Amount (GH₵)', included: true },
    { label: 'Donation type', included: true },
    { label: 'On behalf of', included: true },
    { label: 'Date & time', included: true },
    { label: 'Donor phone', included: false },
    { label: 'Recorded by · internal notes', included: false },
  ];

  public openExport(): void { this.exportOpen.set(true); }
  public closeExport(): void { this.exportOpen.set(false); }
}
