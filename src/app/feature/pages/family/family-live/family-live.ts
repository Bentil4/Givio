import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DonationRow } from '../../../components/donation-row/donation-row';
import { Donation, DonationType, formatCedis, formatCedisShort, totalMinor } from '../../../../data/models/donation';
import type { FamilyEventSummary } from '../../../../data/models/family-access';
import { FamilyAccessService } from '../../../../data/services/family-access.service';
import { ReportService } from '../../../../data/services/report.service';

interface Slice {
  type: DonationType;
  label: string;
  valueLabel: string;
  percent: number;
}

const POLL_INTERVAL_MS = 15_000;

/**
 * The family's read-only live view, reached with an event code and no account.
 *
 * Two rules govern this screen and both are enforced on the server, not here:
 *   1. the payload contains no donorPhone, no recordedBy and no internal notes;
 *   2. resolveAccessCode's own lookup is scoped to the one event the code belongs to.
 * A client-side filter would put the phone numbers in the DOM of a page shared over
 * WhatsApp to a hundred relatives.
 *
 * There's no Appwrite session here (Family has no account, AD-10), so no Realtime
 * subscription is possible — this polls on an interval instead. Stated explicitly as the
 * pragmatic v1, not a silent gap: Story 4.3's AC doesn't require sub-second updates, and a
 * 15s poll is far cheaper than holding a socket open on a borrowed phone's data plan.
 */
@Component({
  selector: 'app-family-live',
  imports: [MatIconModule, DonationRow, RouterLink],
  templateUrl: './family-live.html',
  styleUrl: './family-live.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilyLive implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly familyAccessService = inject(FamilyAccessService);
  private readonly reportService = inject(ReportService);

  private code = '';
  private pollHandle: ReturnType<typeof setInterval> | undefined;

  public readonly event = signal<FamilyEventSummary | null>(null);
  public readonly donations = signal<readonly Donation[]>([]);
  public readonly loading = signal(true);
  public readonly connected = signal(true);
  public readonly notFound = signal(false);
  public readonly lastUpdated = signal<string>('just now');

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

  async ngOnInit(): Promise<void> {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    if (!this.code) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    await this.refresh();
    this.loading.set(false);

    if (!this.notFound()) {
      this.pollHandle = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    }
  }

  ngOnDestroy(): void {
    if (this.pollHandle !== undefined) clearInterval(this.pollHandle);
  }

  private async refresh(): Promise<void> {
    try {
      const result = await this.familyAccessService.resolveByCode(this.code);
      this.event.set(result.event);
      this.donations.set(result.donations);
      this.connected.set(true);
      this.lastUpdated.set('just now');
    } catch {
      // A poll failure (network blip, code revoked mid-session) shouldn't blank out an
      // already-loaded summary — surface it as "Reconnecting…" instead, unless this was the
      // very first load, in which case there's nothing to fall back to.
      if (this.event() === null) {
        this.notFound.set(true);
      } else {
        this.connected.set(false);
      }
    }
  }

  public openExport(): void { this.exportOpen.set(true); }
  public closeExport(): void { this.exportOpen.set(false); }

  public downloadExport(): void {
    const eventName = this.event()?.name ?? 'Event';
    this.reportService.exportDonationsXlsx(eventName, this.donations(), { sanitized: true });
    this.exportOpen.set(false);
  }
}
