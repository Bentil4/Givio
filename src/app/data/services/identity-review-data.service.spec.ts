import { TestBed } from '@angular/core/testing';
import { IdentityReviewDataService } from './identity-review-data.service';
import { FUNCTIONS } from '../../core/appwrite/client';

describe('IdentityReviewDataService', () => {
  let service: IdentityReviewDataService;
  let createExecution: ReturnType<typeof vi.fn>;

  const respond = (status: number, body: object) =>
    createExecution.mockResolvedValueOnce({
      responseStatusCode: status,
      responseBody: JSON.stringify(body),
    });
  const sentBody = () => JSON.parse(createExecution.mock.calls[0][0].body);

  beforeEach(() => {
    createExecution = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: { createExecution } }],
    });
    service = TestBed.inject(IdentityReviewDataService);
  });

  it('listIdentityReviews returns the queue', async () => {
    respond(200, { reviews: [{ reviewId: 'r1', status: 'open' }] });

    expect(await service.listIdentityReviews()).toEqual([{ reviewId: 'r1', status: 'open' }]);
    expect(sentBody()).toEqual({ action: 'listIdentityReviews' });
  });

  it('resolveIdentityReview sends the review and decision', async () => {
    respond(200, { success: true });

    await service.resolveIdentityReview('r1', 'clear');

    expect(sentBody()).toEqual({
      action: 'resolveIdentityReview',
      reviewId: 'r1',
      decision: 'clear',
    });
  });

  it('surfaces the Function refusal', async () => {
    respond(409, { error: 'This review is confirmed' });

    await expect(service.resolveIdentityReview('r1', 'clear')).rejects.toThrow(
      'This review is confirmed',
    );
  });
});
