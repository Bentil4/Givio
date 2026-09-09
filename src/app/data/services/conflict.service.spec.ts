import { TestBed } from '@angular/core/testing';
import { ConflictService } from './conflict.service';
import { ConflictDataService } from './conflict-data.service';
import type { ConflictPair, Donation } from '../models/donation';

const makeDonation = (overrides: Partial<Donation> = {}): Donation => ({
  id: 'd1',
  eventId: 'e1',
  receiptNumber: 'P-1',
  donorName: 'Ama',
  amountMinor: 5000,
  donationType: 'cash',
  recordedBy: 'op-1',
  recordedAt: '2026-01-01T00:00:00.000Z',
  syncStatus: 'conflict',
  ...overrides,
});

const makePair = (overrides: Partial<ConflictPair> = {}): ConflictPair => ({
  receiptNumber: 'P-1',
  local: makeDonation({ donorName: 'Local' }),
  server: makeDonation({ donorName: 'Server' }),
  detectedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('ConflictService', () => {
  let conflictDataService: { listConflicts: ReturnType<typeof vi.fn>; resolveConflict: ReturnType<typeof vi.fn> };
  let service: ConflictService;

  beforeEach(() => {
    conflictDataService = { listConflicts: vi.fn(), resolveConflict: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: ConflictDataService, useValue: conflictDataService }],
    });
    service = TestBed.inject(ConflictService);
  });

  it('loadConflicts delegates to ConflictDataService and populates the conflicts signal', async () => {
    const pair = makePair();
    conflictDataService.listConflicts.mockResolvedValueOnce([pair]);

    await service.loadConflicts();

    expect(service.conflicts()).toEqual([pair]);
  });

  it('resolveConflict delegates then removes the resolved receipt from the conflicts signal', async () => {
    const pairA = makePair({ receiptNumber: 'P-1' });
    const pairB = makePair({ receiptNumber: 'P-2' });
    conflictDataService.listConflicts.mockResolvedValueOnce([pairA, pairB]);
    await service.loadConflicts();

    conflictDataService.resolveConflict.mockResolvedValueOnce(makeDonation());
    await service.resolveConflict('P-1', 'keep-server');

    expect(conflictDataService.resolveConflict).toHaveBeenCalledWith('P-1', 'keep-server');
    expect(service.conflicts()).toEqual([pairB]);
  });
});
