import { Injectable, inject } from '@angular/core';
import { FamilyAccessDataService, type FamilyAccessResult } from './family-access-data.service';

@Injectable({ providedIn: 'root' })
export class FamilyAccessService {
  private readonly familyAccessDataService = inject(FamilyAccessDataService);

  /**
   * Codes whose viewer answered "yes, my personal phone" — held in memory only, never written to
   * storage, so the answer can't outlive this tab or be inherited by whoever uses the device
   * next. A "no" is never remembered at all: the next load of that code always asks again.
   */
  private readonly personalDeviceCodes = new Set<string>();

  async resolveByCode(code: string): Promise<FamilyAccessResult> {
    return this.familyAccessDataService.resolveByCode(code);
  }

  isPersonalDevice(code: string): boolean {
    return this.personalDeviceCodes.has(code);
  }

  markPersonalDevice(code: string): void {
    this.personalDeviceCodes.add(code);
  }

  forget(code: string): void {
    this.personalDeviceCodes.delete(code);
  }
}
