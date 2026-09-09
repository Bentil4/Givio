import { TestBed } from '@angular/core/testing';
import { jsPDF } from 'jspdf';
import { ReceiptService } from './receipt.service';
import type { Donation } from '../models/donation';
import type { Event } from '../models/event';

// jsPDF assigns its plugin methods (save, autoPrint, output, ...) as own instance properties
// inside the constructor, not on jsPDF.prototype — so vi.spyOn(jsPDF.prototype, 'save') can't
// see them. Mocking the whole (non-relative) `jspdf` package sidesteps that entirely.
vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this['internal'] = { pageSize: { getWidth: () => 148, getHeight: () => 210 } };
    this['setFont'] = vi.fn().mockReturnThis();
    this['setFontSize'] = vi.fn().mockReturnThis();
    this['setTextColor'] = vi.fn().mockReturnThis();
    this['setLineWidth'] = vi.fn().mockReturnThis();
    this['text'] = vi.fn().mockReturnThis();
    this['line'] = vi.fn().mockReturnThis();
    this['save'] = vi.fn().mockReturnThis();
    this['autoPrint'] = vi.fn().mockReturnThis();
    this['output'] = vi.fn().mockReturnValue(new URL('blob:mock-url'));
    this['addFileToVFS'] = vi.fn().mockReturnThis();
    this['addFont'] = vi.fn().mockReturnThis();
  }),
}));

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: "Ama & Kojo's Wedding",
  type: 'wedding',
  date: '2026-06-01',
  hostName: 'The Mensah Family',
  status: 'active',
  assignedUserIds: [],
  createdBy: 'admin-1',
  nextReceiptSeq: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeDonation = (overrides: Partial<Donation> = {}): Donation => ({
  id: 'd1',
  eventId: 'e1',
  receiptNumber: 'WEDE1-1',
  donorName: 'Kwame Asante',
  amountMinor: 50000,
  donationType: 'cash',
  recordedBy: 'op-1',
  recordedAt: '2026-06-01T10:00:00.000Z',
  syncStatus: 'synced',
  ...overrides,
});

function latestDoc() {
  const instance = vi.mocked(jsPDF).mock.instances.at(-1) as unknown as Record<
    string,
    ReturnType<typeof vi.fn>
  >;
  if (!instance) throw new Error('jsPDF was never constructed');
  return instance;
}

describe('ReceiptService', () => {
  let service: ReceiptService;

  beforeEach(() => {
    vi.mocked(jsPDF).mockClear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReceiptService);
  });

  describe('downloadReceipt', () => {
    it('saves a PDF named Receipt_[EventName]_[ReceiptNo].pdf', () => {
      service.downloadReceipt(makeDonation(), makeEvent(), 'Efua Mensah');

      expect(latestDoc()['save']).toHaveBeenCalledWith('Receipt_Ama_Kojo_s_Wedding_WEDE1_1.pdf');
    });

    it('sanitizes special characters out of the event name and receipt number', () => {
      service.downloadReceipt(
        makeDonation({ receiptNumber: 'WEDE1-P/3' }),
        makeEvent({ name: '  Extra   Spaces!! ' }),
        'Efua Mensah',
      );

      const [filename] = latestDoc()['save'].mock.calls[0];
      expect(filename).toMatch(/^Receipt_Extra_Spaces_.*\.pdf$/);
      expect(filename).not.toMatch(/[/\\]/);
    });

    it('does not throw for an in-kind donation with no amount and no "on behalf of"', () => {
      expect(() =>
        service.downloadReceipt(
          makeDonation({ donationType: 'in_kind', amountMinor: null, onBehalfOf: undefined }),
          makeEvent({ type: 'funeral' }),
          'Efua Mensah',
        ),
      ).not.toThrow();
    });

    it('includes a provisional marker for a not-yet-synced donation', () => {
      service.downloadReceipt(
        makeDonation({ receiptNumber: 'WEDE1-P1', syncStatus: 'pending' }),
        makeEvent(),
        'Efua Mensah',
      );

      const calls = latestDoc()['text'].mock.calls;
      expect(calls.some((call: unknown[]) => String(call[0]).includes('PROVISIONAL'))).toBe(true);
    });

    it('does not show a provisional marker for a synced donation', () => {
      service.downloadReceipt(makeDonation({ syncStatus: 'synced' }), makeEvent(), 'Efua Mensah');

      const calls = latestDoc()['text'].mock.calls;
      expect(calls.some((call: unknown[]) => String(call[0]).includes('PROVISIONAL'))).toBe(false);
    });

    it('includes the "Donated On Behalf Of" row only when present', () => {
      service.downloadReceipt(
        makeDonation({ onBehalfOf: 'Francisca' }),
        makeEvent(),
        'Efua Mensah',
      );

      const calls = latestDoc()['text'].mock.calls;
      expect(calls.some((call: unknown[]) => call[0] === 'Donated On Behalf Of')).toBe(true);
    });

    it('formats the amount with the real ₵ sign, rendered via the embedded DejaVu Sans font', () => {
      service.downloadReceipt(makeDonation({ amountMinor: 40000 }), makeEvent(), 'Efua Mensah');

      const doc = latestDoc();
      const textCalls = doc['text'].mock.calls;
      const setFontCalls = doc['setFont'].mock.calls;

      // The amount is rendered with the real ₵ sign (not a plain-ASCII substitute)...
      expect(textCalls.some((call: unknown[]) => call[0] === 'GH₵ 400.00')).toBe(true);
      // ...which only renders correctly because the Unicode font is registered and selected.
      expect(doc['addFileToVFS']).toHaveBeenCalledWith('DejaVuSans.ttf', expect.any(String));
      expect(doc['addFont']).toHaveBeenCalledWith('DejaVuSans.ttf', 'DejaVuSans', 'normal');
      expect(setFontCalls.some((call: unknown[]) => call[0] === 'DejaVuSans')).toBe(true);
    });
  });

  describe('printReceipt', () => {
    it('auto-prints and opens the generated PDF in a new tab', () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);

      service.printReceipt(makeDonation(), makeEvent(), 'Efua Mensah');

      expect(latestDoc()['autoPrint']).toHaveBeenCalled();
      expect(open).toHaveBeenCalledWith('blob:mock-url', '_blank');

      open.mockRestore();
    });
  });
});
