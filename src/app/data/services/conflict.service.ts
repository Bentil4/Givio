import { Injectable, inject, signal } from '@angular/core';
import { ConflictDataService } from './conflict-data.service';
import type { ConflictPair, ConflictResolution } from '../models/donation';

@Injectable({ providedIn: 'root' })
export class ConflictService {
  private readonly conflictDataService = inject(ConflictDataService);
  private readonly _conflicts = signal<ConflictPair[]>([]);

  public readonly conflicts = this._conflicts.asReadonly();

  async loadConflicts(): Promise<void> {
    this._conflicts.set(await this.conflictDataService.listConflicts());
  }

  async resolveConflict(receiptNumber: string, resolution: ConflictResolution): Promise<void> {
    await this.conflictDataService.resolveConflict(receiptNumber, resolution);
    this._conflicts.update((conflicts) => conflicts.filter((c) => c.receiptNumber !== receiptNumber));
  }
}
