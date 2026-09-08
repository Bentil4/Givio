import { Injectable, inject } from '@angular/core';
import { FamilyAccessDataService, type FamilyAccessResult } from './family-access-data.service';

@Injectable({ providedIn: 'root' })
export class FamilyAccessService {
  private readonly familyAccessDataService = inject(FamilyAccessDataService);

  async resolveByCode(code: string): Promise<FamilyAccessResult> {
    return this.familyAccessDataService.resolveByCode(code);
  }
}
