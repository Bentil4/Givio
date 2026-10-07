import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ConflictResolver } from '../../../../components/conflict-resolver/conflict-resolver';
import { SkeletonRows } from '../../../../../shared/components/skeleton-rows/skeleton-rows';
import { CompanyConflictDataService } from '../../../../../data/services/company-conflict-data.service';
import { ServiceError } from '../../../../../core/services/service-error';
import type { ConflictResolution, TenantConflict } from '../../../../../data/models/donation';
import { formatCedis } from '../../../../../utils/donation.util';
import { CompanyDonationsStore } from '../company-donations.store';

/**
 * The Super Organizer's sync-conflict queue for their own Events, worked one at a time, as
 * Admin's is: two plausible amounts for somebody's gift deserve a deliberate choice each. Every
 * record waiting here is left out of the totals until it is resolved.
 */
@Component({
  selector: 'app-donation-conflicts',
  imports: [MatIconModule, ConflictResolver, SkeletonRows],
  templateUrl: './donation-conflicts.html',
  styleUrl: './donation-conflicts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationConflicts implements OnInit {
  private readonly conflictData = inject(CompanyConflictDataService);
  protected readonly store = inject(CompanyDonationsStore);

  public readonly conflicts = signal<readonly TenantConflict[]>([]);
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly activeIndex = signal(0);
  public readonly busy = signal(false);
  public readonly resolveError = signal<string | null>(null);

  public readonly active = computed(() => this.conflicts()[this.activeIndex()] ?? null);
  public readonly excludedLabel = computed(() =>
    formatCedis(this.conflicts().reduce((sum, c) => sum + largerAmount(c), 0)),
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.conflicts.set(await this.conflictData.listConflicts());
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(errorMessage(err, "We couldn't load the sync conflicts"));
    } finally {
      this.loading.set(false);
    }
  }

  public select(index: number): void {
    this.activeIndex.set(index);
  }

  public donorOf(conflict: TenantConflict): string {
    return conflict.server.donorName || conflict.local.donorName;
  }

  public async resolve(resolution: ConflictResolution): Promise<void> {
    const conflict = this.active();
    if (!conflict) return;
    this.busy.set(true);
    this.resolveError.set(null);
    try {
      await this.conflictData.resolveConflict(conflict.conflictId, resolution);
      this.dropResolved(conflict.conflictId);
      // The resolution is already saved; a failed refresh only leaves the All tab a step behind.
      await this.store.reloadAllDonations().catch(() => undefined);
    } catch (err) {
      this.resolveError.set(errorMessage(err, "We couldn't resolve the conflict"));
    } finally {
      this.busy.set(false);
    }
  }

  private dropResolved(conflictId: string): void {
    this.conflicts.update((list) => list.filter((c) => c.conflictId !== conflictId));
    const remaining = this.conflicts().length;
    this.activeIndex.update((index) => Math.min(index, Math.max(remaining - 1, 0)));
  }
}

function largerAmount({ local, server }: TenantConflict): number {
  return Math.max(local.amountMinor ?? 0, server.amountMinor ?? 0);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ServiceError ? err.message : fallback;
}
