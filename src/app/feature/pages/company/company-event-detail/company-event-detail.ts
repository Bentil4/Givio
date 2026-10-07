import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SkeletonRows } from '../../../../shared/components/skeleton-rows/skeleton-rows';
import { ReportService } from '../../../../data/services/report.service';
import { EVENT_STATUS_CHIP } from '../../../../data/models/event';
import { countedDonations, formatCedis, totalMinor } from '../../../../utils/donation.util';
import { statusLabel } from '../company-events/event-status-actions';
import { CompanyDonationsStore } from '../company-donations/company-donations.store';
import { DonationBrowser } from '../company-donations/donation-browser/donation-browser';
import { EventBreakdown } from './event-breakdown';

/**
 * /company/events/:id: one of the company's Events with every donation on it — the figures,
 * the split by type, the full list with phone and recorder, and the Excel export. Both
 * organizer roles see all of it; only the Super Organizer gets the correction actions. Its own
 * route because it's deep-linkable from the events table and the dashboard.
 */
@Component({
  selector: 'app-company-event-detail',
  imports: [
    MatIconModule,
    RouterLink,
    DatePipe,
    TitleCasePipe,
    SkeletonRows,
    EventBreakdown,
    DonationBrowser,
  ],
  providers: [CompanyDonationsStore],
  templateUrl: './company-event-detail.html',
  styleUrl: './company-event-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyEventDetail implements OnInit {
  private readonly reportService = inject(ReportService);
  private readonly eventId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  protected readonly store = inject(CompanyDonationsStore);

  public readonly chipClass = EVENT_STATUS_CHIP;
  public readonly statusLabel = statusLabel;

  public readonly event = computed(
    () => this.store.events().find((event) => event.id === this.eventId) ?? null,
  );
  public readonly notFound = computed(
    () => !this.store.loading() && this.store.loadError() === null && this.event() === null,
  );
  public readonly liveDonations = computed(() =>
    this.store.donations().filter((d) => d.eventId === this.eventId && !d.deletedAt),
  );
  public readonly totalLabel = computed(() => formatCedis(totalMinor(this.liveDonations())));
  public readonly donorCount = computed(() => countedDonations(this.liveDonations()).length);

  ngOnInit(): void {
    void this.load();
  }

  public load(): Promise<void> {
    return this.store.load([this.eventId]);
  }

  /** The full sheet — phone and recorder included — with recorders named, not ids. */
  public exportXlsx(): void {
    const named = this.liveDonations().map((d) => ({
      ...d,
      recordedBy: this.store.recorderName(d.recordedBy),
    }));
    this.reportService.exportDonationsXlsx(this.event()?.name ?? 'Event', named);
  }
}
