import { TestBed } from '@angular/core/testing';
import { ReportService, XLSX } from './report.service';
import { buildSettlementReport } from './settlement-report';
import { totalMinor } from '../../utils/donation.util';
import { firstSettlementPeriod } from '../../utils/settlement-period.util';
import type { Donation } from '../models/donation';
import type { Event } from '../models/event';

const NOVEMBER = firstSettlementPeriod('2026-10-15T00:00:00.000Z');

function makeEvent(id: string, overrides: Partial<Event> = {}): Event {
  return {
    id,
    name: `Event ${id}`,
    type: 'funeral',
    date: '2026-11-07',
    hostName: 'Host',
    status: 'active',
    tenantId: 't1',
    assignedUserIds: [],
    createdBy: 'so-1',
    nextReceiptSeq: 0,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  };
}

let donationSeq = 0;
function makeDonation(eventId: string, overrides: Partial<Donation> = {}): Donation {
  donationSeq += 1;
  return {
    id: `d${donationSeq}`,
    eventId,
    receiptNumber: `R-${donationSeq}`,
    donorName: 'Donor',
    amountMinor: 1000,
    donationType: 'cash',
    recordedBy: 'op-1',
    recordedAt: '2026-11-10T10:00:00.000Z',
    syncStatus: 'synced',
    deletedAt: null,
    ...overrides,
  };
}

// Odd pesewa amounts chosen so any float accumulation (0.1 + 0.2 style) would show up.
const EVENTS = [
  makeEvent('e2', { name: 'Mensah Wedding', date: '2026-11-21' }),
  makeEvent('e1', { name: 'Odoi Funeral', date: '2026-11-07', status: 'closed' }),
  makeEvent('e3', { name: 'Quiet Event', date: '2026-12-05' }),
];
const DONATIONS = [
  makeDonation('e1', { amountMinor: 10 }),
  makeDonation('e1', { amountMinor: 20 }),
  makeDonation('e1', { amountMinor: 150_001, donationType: 'mobile_money' }),
  makeDonation('e1', { amountMinor: 99_999, recordedAt: '2026-10-30T23:59:59.999Z' }),
  makeDonation('e1', { amountMinor: 5000, deletedAt: '2026-11-11T00:00:00.000Z' }),
  makeDonation('e2', { amountMinor: 33_333, recordedAt: '2026-11-30T23:59:59.999Z' }),
  makeDonation('e2', { amountMinor: 70_007, recordedAt: '2026-12-01T00:00:00.000Z' }),
  makeDonation('e2', { amountMinor: 4444, syncStatus: 'conflict' }),
  makeDonation('e2', { amountMinor: null, donationType: 'in_kind' }),
  makeDonation('other-tenant-event', { amountMinor: 1_000_000 }),
];

describe('buildSettlementReport', () => {
  const report = buildSettlementReport({
    companyName: 'Asante Events',
    period: NOVEMBER,
    events: EVENTS,
    donations: DONATIONS,
  });

  it('has one row per tenant Event, in event-date order', () => {
    expect(report.rows.map((r) => r.eventName)).toEqual([
      'Odoi Funeral',
      'Mensah Wedding',
      'Quiet Event',
    ]);
  });

  it('totals the period by recordedAt and the Event by every donation, both via totalMinor', () => {
    expect(report.rows.map((r) => r.periodTotalMinor)).toEqual([150_031, 33_333, 0]);
    expect(report.rows.map((r) => r.allTimeTotalMinor)).toEqual([250_030, 103_340, 0]);
  });

  it('ignores donations on Events outside the tenant', () => {
    expect(report.allTimeTotalMinor).toBe(353_370);
  });
});

describe('ReportService.exportSettlementXlsx — reconciliation (FR-22, AD-5)', () => {
  let aoaToSheet: ReturnType<typeof vi.fn>;
  let writeFileXLSX: ReturnType<typeof vi.fn>;
  let bookAppendSheet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    aoaToSheet = vi.fn().mockReturnValue({ sheet: true });
    writeFileXLSX = vi.fn();
    bookAppendSheet = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: XLSX,
          useValue: {
            utils: {
              aoa_to_sheet: aoaToSheet,
              book_new: vi.fn().mockReturnValue({ book: true }),
              book_append_sheet: bookAppendSheet,
            },
            writeFileXLSX,
          },
        },
      ],
    });
  });

  function exportedSheet(): (string | number)[][] {
    const report = buildSettlementReport({
      companyName: 'Asante Events & Co.',
      period: NOVEMBER,
      events: EVENTS,
      donations: DONATIONS,
    });
    TestBed.inject(ReportService).exportSettlementXlsx(report);
    return aoaToSheet.mock.calls[0][0];
  }

  it('writes a header, one row per Event and a grand-total row', () => {
    const sheet = exportedSheet();

    expect(sheet[0]).toEqual([
      'Event',
      'Event Date',
      'Status',
      'Period Total (GHS)',
      'All-Time Total (GHS)',
    ]);
    expect(sheet[1]).toEqual(['Odoi Funeral', '2026-11-07', 'closed', 1500.31, 2500.3]);
    expect(sheet).toHaveLength(5);
    expect(sheet[4][0]).toBe('Grand total');
    expect(bookAppendSheet).toHaveBeenCalledWith({ book: true }, { sheet: true }, 'Settlement');
    expect(writeFileXLSX).toHaveBeenCalledWith(
      { book: true },
      'DMS_Settlement_Asante_Events_Co_2026-11.xlsx',
    );
  });

  it("grand total equals, to the pesewa, the sum of each Event's own totalMinor", () => {
    const sheet = exportedSheet();
    const grandTotal = sheet[sheet.length - 1];
    const tenantEventIds = EVENTS.map((e) => e.id);
    const perEventAllTime = tenantEventIds.map((id) =>
      totalMinor(DONATIONS.filter((d) => d.eventId === id)),
    );
    const perEventPeriod = tenantEventIds.map((id) =>
      totalMinor(DONATIONS.filter((d) => d.eventId === id && d.recordedAt.startsWith('2026-11'))),
    );
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

    expect(Math.round((grandTotal[3] as number) * 100)).toBe(sum(perEventPeriod));
    expect(Math.round((grandTotal[4] as number) * 100)).toBe(sum(perEventAllTime));
    expect(grandTotal[3]).toBe(sum(perEventPeriod) / 100);
    expect(grandTotal[4]).toBe(sum(perEventAllTime) / 100);
    const bodyPeriodMinor = sheet.slice(1, -1).map((row) => Math.round((row[3] as number) * 100));
    expect(sum(bodyPeriodMinor)).toBe(sum(perEventPeriod));
  });
});
