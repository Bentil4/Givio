import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ServiceError } from '../../../../../core/services/service-error';
import type { Donation } from '../../../../../data/models/donation';
import { CompanyDonationsStore } from '../company-donations.store';
import { EditDonationDialog, type DonationEdit } from './edit-donation-dialog';
import { RemoveDonationDialog } from './remove-donation-dialog';
import { RestoreDonationDialog } from './restore-donation-dialog';

export type DonationActionKind = 'edit' | 'remove' | 'restore';

/** Which correction a Super Organizer opened, on which donation. */
export interface DonationAction {
  readonly kind: DonationActionKind;
  readonly donation: Donation;
}

/**
 * Hosts the dialog for one donation correction and sends it through the page's store. Closes
 * once the server accepts; a refusal stays on screen in the dialog so it can be corrected.
 */
@Component({
  selector: 'app-donation-action-dialogs',
  imports: [EditDonationDialog, RemoveDonationDialog, RestoreDonationDialog],
  template: `
    @switch (action().kind) {
      @case ('edit') {
        <app-edit-donation-dialog
          [donation]="action().donation"
          [recorderName]="store.recorderName(action().donation.recordedBy)"
          [busy]="busy()"
          [error]="error()"
          (saved)="saveCorrection($event)"
          (dismissed)="closed.emit()"
        />
      }
      @case ('remove') {
        <app-remove-donation-dialog
          [donation]="action().donation"
          [busy]="busy()"
          [error]="error()"
          (confirmed)="remove($event)"
          (dismissed)="closed.emit()"
        />
      }
      @case ('restore') {
        <app-restore-donation-dialog
          [donation]="action().donation"
          [busy]="busy()"
          [error]="error()"
          (confirmed)="restore()"
          (dismissed)="closed.emit()"
        />
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationActionDialogs {
  protected readonly store = inject(CompanyDonationsStore);

  public readonly action = input.required<DonationAction>();
  public readonly closed = output<void>();

  public readonly busy = signal(false);
  public readonly error = signal<string | null>(null);

  public saveCorrection({ patch, reason }: DonationEdit): Promise<void> {
    const id = this.action().donation.id;
    return this.run(() => this.store.correctDonation(id, patch, reason), 'save the correction');
  }

  public remove(reason: string): Promise<void> {
    const id = this.action().donation.id;
    return this.run(() => this.store.removeDonation(id, reason), 'remove the donation');
  }

  public restore(): Promise<void> {
    const id = this.action().donation.id;
    return this.run(() => this.store.restoreDonation(id), 'restore the donation');
  }

  private async run(write: () => Promise<void>, failedTo: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await write();
      this.closed.emit();
    } catch (err) {
      this.error.set(err instanceof ServiceError ? err.message : `We couldn't ${failedTo}`);
    } finally {
      this.busy.set(false);
    }
  }
}
