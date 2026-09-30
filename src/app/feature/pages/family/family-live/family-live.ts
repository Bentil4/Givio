import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DOCUMENT,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DonationRow } from '../../../components/donation-row/donation-row';
import { DignityBanner } from '../../../components/dignity-banner/dignity-banner';
import { Donation, DonationType } from '../../../../data/models/donation';
import { formatCedis, formatCedisShort, totalMinor } from '../../../../utils/donation.util';
import { base64UrlDecode } from '../../../../utils/base64-url.util';
import { FAMILY_CODE_LENGTH, type FamilyEventSummary } from '../../../../data/models/family-access';
import { FamilyAccessService } from '../../../../data/services/family-access.service';
import { FamilyCodeRejectedError } from '../../../../data/services/family-access-data.service';
import { ReportService } from '../../../../data/services/report.service';

interface Slice {
  type: DonationType;
  label: string;
  valueLabel: string;
  percent: number;
}

const POLL_INTERVAL_MS = 15_000;
const CODE_ENTRY_URL = '/family';

export type DeviceAnswer = 'personal' | 'shared';

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
 *
 * FR-16: before the total is shown, the viewer is asked whether this is their own phone.
 * Anything but "yes" means the view is torn down the moment the page is hidden
 * (visibilitychange — the one signal mobile Safari fires reliably), left (pagehide), or
 * restored from the back/forward cache. The code-bearing URL is the only persisted copy of the
 * "session", so a "no" also overwrites that history entry straight away.
 */
@Component({
  selector: 'app-family-live',
  imports: [MatIconModule, DonationRow, RouterLink, DatePipe, DignityBanner],
  templateUrl: './family-live.html',
  styleUrl: './family-live.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
    '(window:pagehide)': 'leaveIfNotPersonal()',
    '(window:pageshow)': 'onPageShow($event)',
  },
})
export class FamilyLive implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly familyAccessService = inject(FamilyAccessService);
  private readonly reportService = inject(ReportService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly document = inject(DOCUMENT);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);
  private readonly familyTitle = viewChild<ElementRef<HTMLElement>>('familyTitle');

  private code = '';
  private pollHandle: ReturnType<typeof setInterval> | undefined;

  public readonly event = signal<FamilyEventSummary | null>(null);
  public readonly donations = signal<readonly Donation[]>([]);
  public readonly loading = signal(true);
  public readonly connected = signal(true);
  public readonly notFound = signal(false);
  public readonly retrying = signal(false);
  public readonly lastUpdated = signal<string>('just now');
  public readonly deviceAnswer = signal<DeviceAnswer | null>(null);
  public readonly cleared = signal(false);

  public readonly promptOpen = computed(
    () => !this.loading() && !this.notFound() && !this.retrying() && this.deviceAnswer() === null,
  );

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
    const param = this.route.snapshot.paramMap.get('code') ?? '';
    // A raw code is always exactly FAMILY_CODE_LENGTH chars; its base64url encoding never is
    // (an 8-byte input always encodes to 11 chars) — so length alone reliably tells a legacy,
    // pre-encoding shared link apart from an encoded one. Falling back to base64UrlDecode's own
    // null on a malformed param would be ambiguous here: every character valid in a code is
    // also valid base64url, so a raw code would "successfully" decode to the wrong value.
    this.code = param.length === FAMILY_CODE_LENGTH ? param : (base64UrlDecode(param) ?? param);
    if (!this.code) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    if (this.familyAccessService.isPersonalDevice(this.code)) this.deviceAnswer.set('personal');

    await this.refresh();
    if (this.cleared()) return;
    this.loading.set(false);

    if (!this.notFound()) {
      this.pollHandle = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private stopPolling(): void {
    if (this.pollHandle !== undefined) clearInterval(this.pollHandle);
    this.pollHandle = undefined;
  }

  public async refresh(): Promise<void> {
    const code = this.code;
    try {
      const result = await this.familyAccessService.resolveByCode(code);
      if (this.cleared() || code !== this.code) return;
      this.event.set(result.event);
      this.donations.set(result.donations);
      this.connected.set(true);
      this.lastUpdated.set('just now');
      if (this.retrying()) this.recoverFromRetry();
    } catch (error) {
      if (this.cleared() || code !== this.code) return;
      // A regenerated code must stop showing the family's data at once, rather than sitting
      // on a stale summary behind "Reconnecting…" forever.
      if (error instanceof FamilyCodeRejectedError) {
        this.revoke();
        return;
      }
      // A network blip or a server fault says nothing about the code: keep polling, over the
      // last-known summary ("Reconnecting…") or, before the first one, a retrying notice.
      if (this.event() === null) {
        this.retrying.set(true);
      } else {
        this.connected.set(false);
      }
    }
  }

  /** Swapping out the retry notice drops focus from its button; the prompt focuses itself. */
  private recoverFromRetry(): void {
    this.retrying.set(false);
    if (this.deviceAnswer() === null) return;
    afterNextRender(() => this.familyTitle()?.nativeElement.focus(), { injector: this.injector });
  }

  private revoke(): void {
    this.stopPolling();
    this.familyAccessService.forget(this.code);
    this.event.set(null);
    this.donations.set([]);
    this.exportOpen.set(false);
    this.retrying.set(false);
    this.notFound.set(true);
  }

  public answerDevice(answer: DeviceAnswer): void {
    this.deviceAnswer.set(answer);
    if (answer === 'personal') {
      this.familyAccessService.markPersonalDevice(this.code);
    } else {
      this.familyAccessService.forget(this.code);
      // Back/forward and a restored tab must not land on the code-bearing URL again.
      this.location.replaceState(CODE_ENTRY_URL);
    }
    afterNextRender(() => this.familyTitle()?.nativeElement.focus(), { injector: this.injector });
  }

  public onVisibilityChange(): void {
    if (this.document.visibilityState === 'hidden') this.leaveIfNotPersonal();
  }

  public onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) this.leaveIfNotPersonal();
  }

  /** An unanswered prompt counts as "not my phone": the safe default on a borrowed device. */
  public leaveIfNotPersonal(): void {
    if (this.deviceAnswer() === 'personal') return;
    this.clearSession();
  }

  private clearSession(): void {
    if (!this.cleared()) {
      this.cleared.set(true);
      this.stopPolling();
      this.familyAccessService.forget(this.code);
      this.code = '';
      this.event.set(null);
      this.donations.set([]);
      this.exportOpen.set(false);
      this.location.replaceState(CODE_ENTRY_URL);
      // Render the empty view synchronously: the page may be frozen (or snapshotted into the
      // back/forward cache) before the next scheduled change detection would run.
      this.changeDetector.detectChanges();
    }
    void this.router.navigateByUrl(CODE_ENTRY_URL, { replaceUrl: true });
  }

  public openExport(): void {
    this.exportOpen.set(true);
  }
  public closeExport(): void {
    this.exportOpen.set(false);
  }

  public downloadExport(): void {
    const eventName = this.event()?.name ?? 'Event';
    this.reportService.exportDonationsXlsx(eventName, this.donations(), { sanitized: true });
    this.exportOpen.set(false);
  }
}
