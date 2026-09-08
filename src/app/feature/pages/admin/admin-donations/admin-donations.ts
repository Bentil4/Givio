import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Donation, DonationType, DONATION_TYPE_LABELS, formatCedis, totalMinor } from '../../../../data/models/donation';
import { DonationService } from '../../../../data/services/donation.service';
import { ServiceError } from '../../../../data/services/service-error';

interface Filters {
  eventId: string | null;
  type: DonationType | 'all';
  operator: string | 'all';
  search: string;
}

/**
 * Admin donation oversight — the full record, including the two columns no other role sees:
 * donor phone and the recording operator.
 *
 * Two rules the UI enforces and the server must too:
 *   1. Deleting is a soft delete with a REQUIRED reason. Nothing is ever hard-deleted.
 *   2. Editing an amount requires a reason too, because the family may already have seen
 *      the old number on their live view. The reason is what makes the change defensible
 *      three weeks later when someone queries the total.
 */
@Component({
  selector: 'app-admin-donations',
  imports: [MatIconModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-donations.html',
  styleUrl: './admin-donations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDonations implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly donationService = inject(DonationService);

  public readonly donations = this.donationService.donations;
  public readonly loading = signal(true);
  public readonly operators = computed(() => [...new Set(this.donations().map((d) => d.recordedBy))]);

  public readonly filters = signal<Filters>({ eventId: null, type: 'all', operator: 'all', search: '' });
  public readonly editing = signal<Donation | null>(null);
  public readonly deleting = signal<Donation | null>(null);
  public readonly busy = signal(false);
  public readonly saveError = signal<string | null>(null);
  public readonly deleteError = signal<string | null>(null);

  public readonly types: (DonationType | 'all')[] = ['all', 'cash', 'mobile_money', 'in_kind'];
  public readonly labels = DONATION_TYPE_LABELS;

  public readonly editForm = this.fb.nonNullable.group({
    donorName: ['', [Validators.required, Validators.minLength(2)]],
    amount: ['', Validators.pattern(/^\d{1,7}(\.\d{1,2})?$/)],
    donationType: ['cash' as DonationType, Validators.required],
    onBehalfOf: [''],
    // 10 chars is enough to stop "typo" and force an actual sentence.
    reason: ['', [Validators.required, Validators.minLength(10)]],
  });

  public readonly deleteForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(10)]],
  });

  async ngOnInit(): Promise<void> {
    const eventId = this.route.snapshot.queryParamMap.get('event');
    if (eventId) {
      this.filters.update((f) => ({ ...f, eventId }));
      await this.donationService.loadDonationsForEvent(eventId);
    } else {
      await this.donationService.loadAllDonations();
    }
    this.loading.set(false);
  }

  public readonly visible = computed(() => {
    const f = this.filters();
    const needle = f.search.trim().toLowerCase();
    return this.donations().filter((d) => {
      if (d.deletedAt) return false;
      if (f.eventId && d.eventId !== f.eventId) return false;
      if (f.type !== 'all' && d.donationType !== f.type) return false;
      if (f.operator !== 'all' && d.recordedBy !== f.operator) return false;
      if (needle) {
        const hay = (d.donorName + ' ' + d.receiptNumber).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  });

  public readonly totalLabel = computed(() => formatCedis(totalMinor(this.visible())));
  public readonly isEmpty = computed(() => !this.loading() && this.visible().length === 0);
  public readonly filtered = computed(() => {
    const f = this.filters();
    return f.type !== 'all' || f.operator !== 'all' || !!f.search.trim();
  });

  public readonly skeletons = Array.from({ length: 8 }, (_, i) => i);

  public amountLabel(d: Donation): string { return formatCedis(d.amountMinor); }

  public setType(type: DonationType | 'all'): void {
    this.filters.update((f) => ({ ...f, type }));
  }

  public setOperator(operator: string): void {
    this.filters.update((f) => ({ ...f, operator }));
  }

  public setSearch(value: string): void {
    this.filters.update((f) => ({ ...f, search: value }));
  }

  public clearFilters(): void {
    this.filters.set({ eventId: this.filters().eventId, type: 'all', operator: 'all', search: '' });
  }

  public openEdit(d: Donation): void {
    this.editing.set(d);
    this.editForm.reset({
      donorName: d.donorName,
      amount: d.amountMinor === null ? '' : (d.amountMinor / 100).toFixed(2),
      donationType: d.donationType,
      onBehalfOf: d.onBehalfOf ?? '',
      reason: '',
    });
  }

  public closeEdit(): void { this.editing.set(null); }

  /** Shows "was GH₵ 1,200.00" beside a field the Admin has actually changed. */
  public originalLabel(field: 'donorName' | 'amount' | 'donationType' | 'onBehalfOf'): string | null {
    const d = this.editing();
    if (!d) return null;
    const control = this.editForm.controls[field];
    if (!control.dirty) return null;

    switch (field) {
      case 'donorName': return control.value === d.donorName ? null : d.donorName;
      case 'amount': {
        const original = d.amountMinor === null ? '' : (d.amountMinor / 100).toFixed(2);
        return control.value === original ? null : formatCedis(d.amountMinor);
      }
      case 'donationType': return control.value === d.donationType ? null : DONATION_TYPE_LABELS[d.donationType];
      case 'onBehalfOf': return control.value === (d.onBehalfOf ?? '') ? null : (d.onBehalfOf || '—');
    }
  }

  public async saveEdit(): Promise<void> {
    if (this.editForm.invalid) { this.editForm.markAllAsTouched(); return; }
    this.busy.set(true);
    this.saveError.set(null);
    try {
      const v = this.editForm.getRawValue();
      await this.donationService.updateDonation(
        this.editing()!.id,
        {
          donorName: v.donorName,
          amountMinor: v.amount ? Math.round(parseFloat(v.amount) * 100) : null,
          donationType: v.donationType,
          onBehalfOf: v.onBehalfOf || undefined,
        },
        v.reason,
      );
      this.closeEdit();
    } catch (err) {
      this.saveError.set(err instanceof ServiceError ? err.message : 'Failed to save the correction');
    } finally {
      this.busy.set(false);
    }
  }

  public openDelete(d: Donation): void {
    this.deleting.set(d);
    this.deleteForm.reset({ reason: '' });
  }

  public closeDelete(): void { this.deleting.set(null); }

  public async confirmDelete(): Promise<void> {
    if (this.deleteForm.invalid) { this.deleteForm.markAllAsTouched(); return; }
    this.busy.set(true);
    this.deleteError.set(null);
    try {
      await this.donationService.softDeleteDonation(
        this.deleting()!.id,
        this.deleteForm.getRawValue().reason,
      );
      this.closeDelete();
    } catch (err) {
      this.deleteError.set(err instanceof ServiceError ? err.message : 'Failed to remove the donation');
    } finally {
      this.busy.set(false);
    }
  }

  public invalid(form: 'edit' | 'delete', control: string): boolean {
    const c = form === 'edit' ? this.editForm.get(control) : this.deleteForm.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
