import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import type { DonationType } from '../../../../data/models/donation';
import { donationStats, donationTypeSlices } from '../../../../utils/donation-breakdown.util';
import { DonationService } from '../../../../data/services/donation.service';
import { ReportService } from '../../../../data/services/report.service';
import { appDb } from '../../../../data/dexie/app-db';

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
export class AdminReports implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly donationService = inject(DonationService);
  private readonly reportService = inject(ReportService);

  public readonly donations = this.donationService.donations;
  public readonly eventName = signal('');
  public readonly dateRange = signal('');
  public readonly loading = signal(true);

  public readonly conflictCount = computed(
    () => this.donations().filter((d) => !d.deletedAt && d.syncStatus === 'conflict').length,
  );

  public readonly exporting = signal(false);

  async ngOnInit(): Promise<void> {
    const eventId = this.route.snapshot.queryParamMap.get('event');
    if (eventId) {
      const event = await appDb.events.get(eventId);
      this.eventName.set(event?.name ?? '');
      await this.donationService.loadDonationsForEvent(eventId);
    }
    this.loading.set(false);
  }

  public readonly isEmpty = computed(() => !this.loading() && this.donations().length === 0);

  private readonly counted = computed(() =>
    this.donations().filter((d) => !d.deletedAt && d.syncStatus !== 'conflict'),
  );

  public readonly stats = computed(() => donationStats(this.counted(), this.dateRange()));

  public readonly slices = computed(() => donationTypeSlices(this.counted()));

  /** Built as a real CSS conic-gradient so the donut needs no chart library. */
  public readonly donutGradient = computed(() => {
    // Three distinct hues, matching the legend dots in admin-reports.scss (.is-cash/
    // .is-mobile_money/.is-in_kind) — cash and mobile money previously shared one green hue
    // (--primary-deep/--primary-mid, same color one shade apart), reading as near-identical.
    const colors: Record<DonationType, string> = {
      cash: 'var(--primary-deep)',
      mobile_money: 'var(--action-accent-bg)',
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
    return (
      `${n} ${n === 1 ? 'donation is' : 'donations are'} excluded from these figures until ` +
      'the sync conflict is resolved.'
    );
  });

  public colorClass(type: DonationType): string {
    return 'is-' + type;
  }

  public async exportXlsx(): Promise<void> {
    this.exporting.set(true);
    try {
      this.reportService.exportDonationsXlsx(this.eventName() || 'Event', this.donations());
    } finally {
      this.exporting.set(false);
    }
  }
}
