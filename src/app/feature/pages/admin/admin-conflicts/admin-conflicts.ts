import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ConflictResolver } from '../../../components/conflict-resolver/conflict-resolver';
import { ConflictPair, ConflictResolution, formatCedis } from '../../../../data/models/donation';
import { ConflictService } from '../../../../data/services/conflict.service';
import { ServiceError } from '../../../../data/services/service-error';

/**
 * The conflict queue. Wraps ConflictResolver with the list, the running count, and the
 * consequence of leaving one unresolved.
 *
 * Conflicts are worked one at a time on purpose. Two comparisons side by side invites
 * pattern-matching ("keep server, keep server, keep server") and each of these records is
 * somebody's gift with two plausible amounts.
 */
@Component({
  selector: 'app-admin-conflicts',
  imports: [MatIconModule, ConflictResolver],
  templateUrl: './admin-conflicts.html',
  styleUrl: './admin-conflicts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminConflicts implements OnInit {
  private readonly conflictService = inject(ConflictService);

  public readonly conflicts = this.conflictService.conflicts;
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);

  public readonly activeIndex = signal(0);
  public readonly busy = signal(false);
  public readonly resolveError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      await this.conflictService.loadConflicts();
    } catch {
      this.loadError.set('Failed to load sync conflicts.');
    } finally {
      this.loading.set(false);
    }
  }

  public readonly active = computed(() => this.conflicts()[this.activeIndex()] ?? null);
  public readonly isEmpty = computed(() => !this.loading() && this.conflicts().length === 0);

  /** The amount at stake across everything unresolved — this is what is missing from totals. */
  public readonly excludedLabel = computed(() => {
    const sum = this.conflicts().reduce((acc, c) => {
      const local = c.local.amountMinor ?? 0;
      const server = c.server.amountMinor ?? 0;
      return acc + Math.max(local, server);
    }, 0);
    return formatCedis(sum);
  });

  public select(index: number): void { this.activeIndex.set(index); }

  public receiptOf(c: ConflictPair): string { return c.receiptNumber; }

  public donorOf(c: ConflictPair): string { return c.server.donorName || c.local.donorName; }

  public spreadOf(c: ConflictPair): string {
    const local = c.local.amountMinor ?? 0;
    const server = c.server.amountMinor ?? 0;
    if (local === server) return 'other fields differ';
    return formatCedis(Math.abs(server - local)) + ' apart';
  }

  public async resolve(resolution: ConflictResolution): Promise<void> {
    this.busy.set(true);
    this.resolveError.set(null);
    try {
      await this.conflictService.resolveConflict(this.active()!.receiptNumber, resolution);
      // Whichever version loses is archived in the audit trail, not discarded.
      const remaining = this.conflicts().length - 1;
      if (this.activeIndex() >= remaining && remaining > 0) {
        this.activeIndex.set(remaining - 1);
      }
    } catch (err) {
      this.resolveError.set(err instanceof ServiceError ? err.message : 'Failed to resolve the conflict');
    } finally {
      this.busy.set(false);
    }
  }
}
