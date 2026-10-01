import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../../core/appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import type { DuplicateEventFlag, DuplicateFlagDecision } from '../models/duplicate-event-flag';

/**
 * Story 7.4 (FR-14): Admin's queue of possible duplicate Events. The flags table is
 * Function-only (each flag sets two tenants' Events side by side), so both calls go through
 * the Function, which refuses any caller without the admin Label.
 */
@Injectable({ providedIn: 'root' })
export class DuplicateEventFlagDataService {
  private readonly functions = inject(FUNCTIONS);

  async listDuplicateEventFlags(): Promise<DuplicateEventFlag[]> {
    const { flags } = await this.invoke<{ flags: DuplicateEventFlag[] }>(
      'listDuplicateEventFlags',
      'Failed to load duplicate-event flags',
    );
    return flags;
  }

  async resolveDuplicateEventFlag(flagId: string, decision: DuplicateFlagDecision): Promise<void> {
    await this.invoke('resolveDuplicateEventFlag', 'Failed to save your decision', {
      flagId,
      decision,
    });
  }

  private invoke<T>(action: string, failureMessage: string, payload: object = {}): Promise<T> {
    return invokeAdminFunction<T>(this.functions, {
      action,
      invokeFailureMessage: failureMessage,
      payload,
    });
  }
}
