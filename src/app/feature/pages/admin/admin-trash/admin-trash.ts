import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Donation, formatCedis } from '../../../../data/models/donation';
import { DonationService } from '../../../../data/services/donation.service';
import { ServiceError } from '../../../../data/services/service-error';

const RECOVERY_WINDOW_DAYS = 30;

/**
 * Deleted donations and recovery.
 *
 * There is no hard delete anywhere in Givio. A removed record is hidden from operators and
 * families, excluded from every total and export, and recoverable for 30 days — after which
 * it is archived, not erased. At a funeral collection, "we deleted it by accident" has to be
 * a recoverable mistake, and a disputed total three weeks later has to be answerable.
 */
@Component({
  selector: 'app-admin-trash',
  imports: [MatIconModule],
  templateUrl: './admin-trash.html',
  styleUrl: './admin-trash.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTrash implements OnInit {
  private readonly donationService = inject(DonationService);

  public readonly deleted = computed(() => this.donationService.donations().filter((d) => !!d.deletedAt));
  public readonly loading = signal(true);

  public readonly recovering = signal<Donation | null>(null);
  public readonly busy = signal(false);
  public readonly recoverError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.donationService.loadAllDonations();
    this.loading.set(false);
  }

  public readonly skeletons = Array.from({ length: 3 }, (_, i) => i);

  public readonly isEmpty = computed(() => !this.loading() && this.deleted().length === 0);

  public readonly totalLabel = computed(() =>
    formatCedis(this.deleted().reduce((sum, d) => sum + (d.amountMinor ?? 0), 0)),
  );

  public amountLabel(d: Donation): string { return formatCedis(d.amountMinor); }

  public daysLeft(d: Donation): number {
    if (!d.deletedAt) return RECOVERY_WINDOW_DAYS;
    const elapsed = (Date.now() - new Date(d.deletedAt).getTime()) / 86_400_000;
    return Math.max(0, Math.ceil(RECOVERY_WINDOW_DAYS - elapsed));
  }

  /** Under a week left is worth flagging — after that the record only lives in the archive. */
  public isExpiring(d: Donation): boolean { return this.daysLeft(d) <= 7; }

  public daysLabel(d: Donation): string {
    const days = this.daysLeft(d);
    if (days === 0) return 'archived';
    return days === 1 ? '1 day left' : `${days} days left`;
  }

  public askRecover(d: Donation): void { this.recovering.set(d); }
  public dismiss(): void { this.recovering.set(null); }

  public async confirmRecover(): Promise<void> {
    this.busy.set(true);
    this.recoverError.set(null);
    try {
      // Recovery is itself an audited action (logDonationAudit's 'recover' entry), and the
      // record re-enters every total the moment DonationService's signal updates.
      await this.donationService.recoverDonation(this.recovering()!.id);
      this.dismiss();
    } catch (err) {
      this.recoverError.set(err instanceof ServiceError ? err.message : 'Failed to recover the donation');
    } finally {
      this.busy.set(false);
    }
  }
}
