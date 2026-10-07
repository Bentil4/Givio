import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { DonationRow } from '../../../../components/donation-row/donation-row';
import type { Donation } from '../../../../../data/models/donation';
import { CompanyDonationsStore } from '../company-donations.store';
import type { DonationAction } from '../donation-dialogs/donation-action-dialogs';

/**
 * A company's live donations, in full: phone, recorder and receipt. A Super Organizer also
 * gets Correct and Remove on each one; a co-Organizer reads the same list with no actions.
 */
@Component({
  selector: 'app-donation-list',
  imports: [DonationRow],
  templateUrl: './donation-list.html',
  styleUrl: './donation-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationList {
  protected readonly store = inject(CompanyDonationsStore);

  public readonly donations = input.required<readonly Donation[]>();
  public readonly label = input.required<string>();
  public readonly actionRequested = output<DonationAction>();
}
