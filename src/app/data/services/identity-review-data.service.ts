import { Injectable, inject } from '@angular/core';
import { FUNCTIONS } from '../../core/appwrite/client';
import { invokeAdminFunction } from '../appwrite/invoke-admin-function';
import type { IdentityReview, IdentityReviewDecision } from '../models/identity-review';

/**
 * Story 7.2: Admin's queue of screened team additions. The reviews table is Function-only
 * (it names people across tenants), so both calls go through the Function, which refuses any
 * caller without the admin Label.
 */
@Injectable({ providedIn: 'root' })
export class IdentityReviewDataService {
  private readonly functions = inject(FUNCTIONS);

  async listIdentityReviews(): Promise<IdentityReview[]> {
    const { reviews } = await this.invoke<{ reviews: IdentityReview[] }>(
      'listIdentityReviews',
      'Failed to load flagged additions',
    );
    return reviews;
  }

  async resolveIdentityReview(reviewId: string, decision: IdentityReviewDecision): Promise<void> {
    await this.invoke('resolveIdentityReview', 'Failed to save your decision', {
      reviewId,
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
