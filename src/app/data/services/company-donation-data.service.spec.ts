import { TestBed } from '@angular/core/testing';
import { DATABASES, FUNCTIONS } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { CompanyDonationDataService } from './company-donation-data.service';
import { CompanyConflictDataService } from './company-conflict-data.service';

const donationRow = (id: string, eventId: string) => ({
  $id: id,
  eventId,
  receiptNumber: `R-${id}`,
  donorName: 'Ama',
  donorPhone: '+233200000000',
  notes: 'Paid at the gate',
  amountMinor: 1500,
  donationType: 'cash',
  recordedBy: 'op-1',
  recordedAt: '2026-11-10T10:00:00.000Z',
  syncStatus: null,
  deletedAt: '2026-11-11T09:00:00.000Z',
  deletedBy: 'so-1',
  deletionReason: 'Duplicate of R-1',
});

describe('CompanyDonationDataService', () => {
  let listRows: ReturnType<typeof vi.fn>;
  let createExecution: ReturnType<typeof vi.fn>;
  let service: CompanyDonationDataService;

  const respond = (status: number, body: object) =>
    createExecution.mockResolvedValueOnce({
      responseStatusCode: status,
      responseBody: JSON.stringify(body),
    });
  const sentBody = () => JSON.parse(createExecution.mock.calls[0][0].body);

  beforeEach(() => {
    listRows = vi.fn();
    createExecution = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: DATABASES, useValue: { listRows } },
        { provide: FUNCTIONS, useValue: { createExecution } },
      ],
    });
    service = TestBed.inject(CompanyDonationDataService);
  });

  it('reads every field of the donations on the given Events, phone and deletion included', async () => {
    listRows.mockResolvedValue({ rows: [donationRow('d1', 'e1')] });

    const [donation] = await service.listDonationsForEvents(['e1', 'e2']);

    expect(donation).toEqual(
      expect.objectContaining({
        id: 'd1',
        donorPhone: '+233200000000',
        notes: 'Paid at the gate',
        recordedBy: 'op-1',
        syncStatus: 'synced',
        deletedBy: 'so-1',
        deletionReason: 'Duplicate of R-1',
      }),
    );
    const queries: string[] = listRows.mock.calls[0][0].queries;
    expect(queries.some((q) => q.includes('"eventId"') && q.includes('e2'))).toBe(true);
  });

  it('skips the read entirely when there are no Events', async () => {
    expect(await service.listDonationsForEvents([])).toEqual([]);
    expect(listRows).not.toHaveBeenCalled();
  });

  it('reports a failed read as a ServiceError', async () => {
    listRows.mockRejectedValue(new Error('offline'));

    await expect(service.listDonationsForEvents(['e1'])).rejects.toBeInstanceOf(ServiceError);
  });

  it('sends a correction with its reason and maps the saved row back', async () => {
    respond(200, { donation: { ...donationRow('d1', 'e1'), amountMinor: 2000 } });

    const saved = await service.editDonation('d1', { amountMinor: 2000 }, 'Donor confirmed it');

    expect(sentBody()).toEqual({
      action: 'editTenantDonation',
      donationId: 'd1',
      patch: { amountMinor: 2000 },
      reason: 'Donor confirmed it',
    });
    expect(saved.amountMinor).toBe(2000);
  });

  it('soft-deletes with a reason and restores by id', async () => {
    respond(200, { donation: donationRow('d1', 'e1') });
    respond(200, { donation: { ...donationRow('d1', 'e1'), deletedAt: null } });

    await service.softDeleteDonation('d1', 'Duplicate of R-1');
    const restored = await service.restoreDonation('d1');

    expect(sentBody()).toEqual({
      action: 'softDeleteTenantDonation',
      donationId: 'd1',
      reason: 'Duplicate of R-1',
    });
    expect(JSON.parse(createExecution.mock.calls[1][0].body)).toEqual({
      action: 'restoreTenantDonation',
      donationId: 'd1',
    });
    expect(restored.deletedAt).toBeNull();
  });

  it("surfaces the Function's refusal message", async () => {
    respond(403, { error: 'Forbidden' });

    await expect(service.restoreDonation('d1')).rejects.toThrow('Forbidden');
  });
});

describe('CompanyConflictDataService', () => {
  let createExecution: ReturnType<typeof vi.fn>;
  let service: CompanyConflictDataService;

  beforeEach(() => {
    createExecution = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: { createExecution } }],
    });
    service = TestBed.inject(CompanyConflictDataService);
  });

  it('lists conflicts and resolves one by id, never naming a tenant', async () => {
    const conflict = { conflictId: 'c1', eventId: 'e1', receiptNumber: 'R-1' };
    createExecution
      .mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ conflicts: [conflict] }),
      })
      .mockResolvedValueOnce({ responseStatusCode: 200, responseBody: '{"success":true}' });

    expect(await service.listConflicts()).toEqual([conflict]);
    await service.resolveConflict('c1', 'keep-both');

    const bodies = createExecution.mock.calls.map(([call]) => JSON.parse(call.body));
    expect(bodies).toEqual([
      { action: 'listTenantConflicts' },
      { action: 'resolveTenantConflict', conflictId: 'c1', resolution: 'keep-both' },
    ]);
  });
});
