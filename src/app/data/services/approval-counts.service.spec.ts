import { DestroyRef, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApprovalCountsService } from './approval-counts.service';
import { FUNCTIONS } from '../../core/appwrite/client';

describe('ApprovalCountsService', () => {
  let service: ApprovalCountsService;
  let createExecution: ReturnType<typeof vi.fn>;

  const respond = (status: number, body: object) =>
    createExecution.mockResolvedValueOnce({
      responseStatusCode: status,
      responseBody: JSON.stringify(body),
    });
  const counts = { applications: 2, identityReviews: 3, duplicateEvents: 1 };

  beforeEach(() => {
    createExecution = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: { createExecution } }],
    });
    service = TestBed.inject(ApprovalCountsService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at zero', () => {
    expect(service.total()).toBe(0);
  });

  it('refresh asks the Function and sums the three queues', async () => {
    respond(200, { success: true, counts });

    await service.refresh();

    expect(JSON.parse(createExecution.mock.calls[0][0].body)).toEqual({
      action: 'countPendingApprovals',
    });
    expect(service.counts()).toEqual(counts);
    expect(service.total()).toBe(6);
  });

  it('keeps the last known counts when a refresh fails', async () => {
    respond(200, { success: true, counts });
    await service.refresh();
    respond(502, { error: 'Failed to count pending approvals' });

    await expect(service.refresh()).resolves.toBeUndefined();

    expect(service.total()).toBe(6);
  });

  it('polls every minute until its owner is destroyed', async () => {
    vi.useFakeTimers();
    createExecution.mockResolvedValue({
      responseStatusCode: 200,
      responseBody: JSON.stringify({ success: true, counts }),
    });
    const owner = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

    service.pollWhileAlive(owner.get(DestroyRef));
    await vi.advanceTimersByTimeAsync(60_000);
    owner.destroy();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(createExecution).toHaveBeenCalledTimes(2);
  });
});
