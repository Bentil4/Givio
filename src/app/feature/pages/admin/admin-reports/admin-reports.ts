import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Donation, DonationType, DONATION_TYPE_LABELS, formatCedis, formatCedisShort, totalMinor } from '../../../../data/models/donation';

interface TypeSlice {
  type: DonationType;
  label: string;
  valueLabel: string;
  percent: number;
  /** Cumulative offsets for the conic-gradient wedge. */
  from: number;
  to: number;
}

interface HourBar {
  hour: string;
  count: number;
  heightPercent: number;
  isPeak: boolean;
}

/**
 * Reports and export.
 *
 * Every figure here is derived from the same totalMinor() helper the rest of the app uses, so
 * a report can never disagree with the family's live view. Soft-deleted and in-conflict
 * records are excluded by that helper — which is why an unresolved conflict shows up as a
 * gap in the total rather than a silently wrong number.
 */
@Component({
  selector: 'app-admin-reports',
  imports: [MatIconModule],
  templateUrl: './admin-reports.html',
  styleUrl: './admin-reports.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReports {
  // ── replace with service-backed signals ──────────────────────────────
  public readonly donations = signal<readonly Donation[]>([]);
  public readonly eventName = signal('');
  public readonly dateRange = signal('');
  public readonly loading = signal(true);
  public readonly conflictCount = signal(0);
  // ─────────────────────────────────────────────────────────────────────

  public readonly exporting = signal(false);

  public readonly isEmpty = computed(() => !this.loading() && this.donations().length === 0);

  private readonly counted = computed(() =>
    this.donations().filter((d) => !d.deletedAt && d.syncStatus !== 'conflict'),
  );

  public readonly stats = computed(() => {
    const rows = this.counted();
    const total = totalMinor(rows);
    const cash = rows.filter((d) => d.amountMinor !== null).map((d) => d.amountMinor!);
    const sorted = [...cash].sort((a, b) => a - b);
    const median = sorted.length
      ? sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : 0;
    const largest = sorted.length ? sorted[sorted.length - 1] : 0;
    const largestDonor = rows.find((d) => d.amountMinor === largest);

    return [
      { key: 'Total raised', value: formatCedisShort(total), sub: `${rows.length} validated records` },
      { key: 'Donors', value: String(rows.length), sub: this.dateRange() || 'this event' },
      {
        key: 'Average gift',
        value: cash.length ? formatCedisShort(Math.round(total / cash.length)) : '—',
        sub: median ? `Median ${formatCedis(median)}` : 'no cash gifts yet',
      },
      {
        key: 'Largest gift',
        value: largest ? formatCedisShort(largest) : '—',
        sub: largestDonor?.onBehalfOf || largestDonor?.donorName || '—',
      },
    ];
  });

  public readonly slices = computed<TypeSlice[]>(() => {
    const rows = this.counted();
    const total = totalMinor(rows);
    const byType: Record<DonationType, number> = { cash: 0, mobile_money: 0, in_kind: 0 };
    for (const d of rows) byType[d.donationType] += d.amountMinor ?? 0;

    let cursor = 0;
    return (Object.keys(byType) as DonationType[]).map((type) => {
      const percent = total > 0 ? Math.round((byType[type] / total) * 100) : 0;
      const from = cursor;
      cursor += percent;
      return {
        type,
        label: DONATION_TYPE_LABELS[type],
        valueLabel: formatCedis(byType[type]),
        percent,
        from,
        to: cursor,
      };
    });
  });

  /** Built as a real CSS conic-gradient so the donut needs no chart library. */
  public readonly donutGradient = computed(() => {
    const colors: Record<DonationType, string> = {
      cash: 'var(--primary-deep)',
      mobile_money: 'var(--primary-mid)',
      in_kind: 'var(--accent-sky)',
    };
    const stops = this.slices()
      .filter((s) => s.percent > 0)
      .map((s) => `${colors[s.type]} ${s.from}% ${s.to}%`)
      .join(', ');
    return stops ? `conic-gradient(${stops})` : 'conic-gradient(var(--data-1) 0 100%)';
  });

  public readonly hourBars = computed<HourBar[]>(() => {
    const buckets = new Map<number, number>();
    for (const d of this.counted()) {
      const hour = new Date(d.recordedAt).getHours();
      if (Number.isNaN(hour)) continue;
      buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
    }
    if (buckets.size === 0) return [];

    const hours = [...buckets.keys()].sort((a, b) => a - b);
    const peak = Math.max(...buckets.values());

    return hours.map((h) => {
      const count = buckets.get(h)!;
      const suffix = h < 12 ? 'am' : 'pm';
      const display = h % 12 === 0 ? 12 : h % 12;
      return {
        hour: `${display}${suffix}`,
        count,
        heightPercent: Math.round((count / peak) * 100),
        isPeak: count === peak,
      };
    });
  });

  public readonly peakLabel = computed(() => {
    const peak = this.hourBars().find((b) => b.isPeak);
    return peak ? `Peak ${peak.hour} — ${peak.count} donations` : '';
  });

  public readonly excludedNote = computed(() => {
    const n = this.conflictCount();
    if (n === 0) return null;
    return `${n} ${n === 1 ? 'donation is' : 'donations are'} excluded from these figures until `
      + 'the sync conflict is resolved.';
  });

  public colorClass(type: DonationType): string { return 'is-' + type; }

  public async exportXlsx(): Promise<void> {
    this.exporting.set(true);
    try {
      // await reportService.exportXlsx({ eventId, range });
      // One sheet: the event summary at the top, every column, a totals row at the bottom.
    } finally {
      this.exporting.set(false);
    }
  }
}
