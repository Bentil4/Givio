import { TestBed } from '@angular/core/testing';
import { DonationService } from './donation.service';
import { DonationDataService } from './donation-data.service';
import type { Donation, DonationDraft } from '../models/donation';

const makeDonation = (overrides: Partial<Donation> = {}): Donation => ({
  id: 'd1',
  eventId: 'e1',
  receiptNumber: 'P-1',
  donorName: 'Ama',
  amountMinor: 5000,
  donationType: 'cash',
  recordedBy: 'op-1',
  recordedAt: '2026-01-01T00:00:00.000Z',
  syncStatus: 'pending',
  ...overrides,
});

const makeDraft = (overrides: Partial<DonationDraft> = {}): DonationDraft => ({
  localId: 'local-1',
  eventId: 'e1',
  donorName: 'Ama',
  amountMinor: 5000,
  donationType: 'cash',
  ...overrides,
});

describe('DonationService', () => {
  let service: DonationService;
  let donationDataService: {
    listDonationsForEvent: ReturnType<typeof vi.fn>;
    createDonation: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    donationDataService = { listDonationsForEvent: vi.fn(), createDonation: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: DonationDataService, useValue: donationDataService }],
    });
    service = TestBed.inject(DonationService);
  });

  it('loadDonationsForEvent delegates to DonationDataService and sets the donations signal', async () => {
    const donations = [makeDonation()];
    donationDataService.listDonationsForEvent.mockResolvedValueOnce(donations);

    await service.loadDonationsForEvent('e1');

    expect(donationDataService.listDonationsForEvent).toHaveBeenCalledWith('e1');
    expect(service.donations()).toEqual(donations);
  });

  it('createDonation delegates to DonationDataService and prepends to the donations signal', async () => {
    const existing = makeDonation({ id: 'older' });
    donationDataService.listDonationsForEvent.mockResolvedValueOnce([existing]);
    await service.loadDonationsForEvent('e1');

    const created = makeDonation({ id: 'newest' });
    donationDataService.createDonation.mockResolvedValueOnce(created);

    const result = await service.createDonation(makeDraft());

    expect(result).toEqual(created);
    expect(service.donations()).toEqual([created, existing]);
  });
});
