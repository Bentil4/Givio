import { TestBed } from '@angular/core/testing';
import { ReportService, XLSX } from './report.service';
import type { Donation } from '../models/donation';

const makeDonation = (overrides: Partial<Donation> = {}): Donation => ({
  id: 'd1',
  eventId: 'e1',
  receiptNumber: 'P-1',
  donorName: 'Ama',
  amountMinor: 150050,
  donationType: 'cash',
  recordedBy: 'op-1',
  recordedAt: '2026-01-01T10:00:00.000Z',
  syncStatus: 'synced',
  ...overrides,
});

describe('ReportService', () => {
  let service: ReportService;
  let aoaToSheet: ReturnType<typeof vi.fn>;
  let bookNew: ReturnType<typeof vi.fn>;
  let bookAppendSheet: ReturnType<typeof vi.fn>;
  let writeFileXLSX: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    aoaToSheet = vi.fn().mockReturnValue({ sheet: true });
    bookNew = vi.fn().mockReturnValue({ book: true });
    bookAppendSheet = vi.fn();
    writeFileXLSX = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: XLSX,
          useValue: {
            utils: {
              aoa_to_sheet: aoaToSheet,
              book_new: bookNew,
              book_append_sheet: bookAppendSheet,
            },
            writeFileXLSX,
          },
        },
      ],
    });
    service = TestBed.inject(ReportService);
  });

  it('builds the full sheet with a totals row matching totalMinor exactly', () => {
    service.exportDonationsXlsx('Ama & Kojo', [
      makeDonation({ amountMinor: 150050 }),
      makeDonation({ id: 'd2', amountMinor: 5000 }),
    ]);

    const rows = aoaToSheet.mock.calls[0][0] as unknown[][];
    expect(rows[0]).toEqual([
      'Receipt No.', 'Donor Name', 'Phone', 'Amount (GHS)', 'Type',
      'Donated On Behalf Of', 'Notes', 'Recorded By', 'Date & Time',
    ]);
    expect(rows).toHaveLength(4); // header + 2 rows + totals
    const totalsRow = rows[3];
    expect(totalsRow[3]).toBe(1550.5); // (150050 + 5000) / 100
    expect(totalsRow[totalsRow.length - 1]).toBe('Total');
  });

  it('excludes soft-deleted and conflicted donations from both rows and the total', () => {
    service.exportDonationsXlsx('Ama & Kojo', [
      makeDonation({ amountMinor: 1000 }),
      makeDonation({ id: 'd2', amountMinor: 9999, deletedAt: '2026-02-01T00:00:00.000Z' }),
      makeDonation({ id: 'd3', amountMinor: 9999, syncStatus: 'conflict' }),
    ]);

    const rows = aoaToSheet.mock.calls[0][0] as unknown[][];
    expect(rows).toHaveLength(3); // header + 1 valid row + totals
    expect(rows[2][3]).toBe(10); // 1000 / 100
  });

  it('drops Phone and Recorded By when sanitized', () => {
    service.exportDonationsXlsx('Ama & Kojo', [makeDonation({ donorPhone: '020 000 0000' })], {
      sanitized: true,
    });

    const rows = aoaToSheet.mock.calls[0][0] as unknown[][];
    expect(rows[0]).not.toContain('Phone');
    expect(rows[0]).not.toContain('Recorded By');
  });

  it('names the file DMS_<EventName>_<date>.xlsx with unsafe characters stripped', () => {
    service.exportDonationsXlsx('Ama & Kojo!', [makeDonation()]);

    const filename = writeFileXLSX.mock.calls[0][1] as string;
    expect(filename).toMatch(/^DMS_Ama_Kojo_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
