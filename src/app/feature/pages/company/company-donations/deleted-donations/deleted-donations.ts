import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import type { Donation } from '../../../../../data/models/donation';
import { formatCedis } from '../../../../../utils/donation.util';
import {
  isRecoveryExpiring,
  recoveryDaysLabel,
  recoveryDaysLeft,
} from '../../../../../utils/donation-recovery.util';
import { CompanyDonationsStore } from '../company-donations.store';
import {
  DonationActionDialogs,
  type DonationAction,
} from '../donation-dialogs/donation-action-dialogs';

interface DeletedDonationView {
  readonly donation: Donation;
  readonly amountLabel: string;
  readonly deletedByName: string;
  readonly daysLabel: string;
  readonly expiring: boolean;
  readonly restorable: boolean;
}

/**
 * The company's removed donations: who removed each, why, and how long it can still be
 * restored. Nothing here is erased — after 30 days a record is archived. Only the Super
 * Organizer gets Restore.
 */
@Component({
  selector: 'app-deleted-donations',
  imports: [DatePipe, MatIconModule, DonationActionDialogs],
  templateUrl: './deleted-donations.html',
  styleUrl: './deleted-donations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeletedDonations {
  protected readonly store = inject(CompanyDonationsStore);
  private readonly openedAtMs = Date.now();

  public readonly donations = input.required<readonly Donation[]>();
  public readonly action = signal<DonationAction | null>(null);

  public readonly rows = computed(() => this.donations().map((d) => this.toView(d)));
  public readonly totalLabel = computed(() =>
    formatCedis(this.donations().reduce((sum, d) => sum + (d.amountMinor ?? 0), 0)),
  );

  public askRestore(donation: Donation): void {
    this.action.set({ kind: 'restore', donation });
  }

  private toView(donation: Donation): DeletedDonationView {
    const daysLeft = recoveryDaysLeft(donation.deletedAt, this.openedAtMs);
    return {
      donation,
      amountLabel: formatCedis(donation.amountMinor),
      deletedByName: donation.deletedBy ? this.store.recorderName(donation.deletedBy) : '—',
      daysLabel: recoveryDaysLabel(daysLeft),
      expiring: isRecoveryExpiring(daysLeft),
      restorable: daysLeft > 0,
    };
  }
}
