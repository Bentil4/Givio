import { TestBed } from '@angular/core/testing';
import { TeamDataService } from './team-data.service';
import { FUNCTIONS } from '../../core/appwrite/client';

// Story 7.3: a revoke always carries its reason; only for-cause carries an explanation.

describe('TeamDataService revokeMembership', () => {
  let service: TeamDataService;
  let createExecution: ReturnType<typeof vi.fn>;

  const sentBody = () => JSON.parse(createExecution.mock.calls[0][0].body);

  beforeEach(() => {
    createExecution = vi.fn().mockResolvedValue({
      responseStatusCode: 200,
      responseBody: JSON.stringify({ success: true }),
    });
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: { createExecution } }],
    });
    service = TestBed.inject(TeamDataService);
  });

  it('sends a for-cause explanation with the reason', async () => {
    await service.revokeMembership('m1', { reason: 'for_cause', explanation: 'Took cash' });

    expect(sentBody()).toEqual({
      action: 'revokeMembership',
      membershipId: 'm1',
      reason: 'for_cause',
      explanation: 'Took cash',
    });
  });

  it('keeps the Function status on a failed revoke so the page can offer a retry', async () => {
    createExecution.mockResolvedValueOnce({
      responseStatusCode: 502,
      responseBody: JSON.stringify({ error: 'Access was revoked, but finishing it failed' }),
    });

    await expect(service.revokeMembership('m1', { reason: 'routine' })).rejects.toMatchObject({
      status: 502,
      message: 'Access was revoked, but finishing it failed',
    });
  });
});
