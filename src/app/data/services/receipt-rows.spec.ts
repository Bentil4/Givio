import type { Donation } from '../models/donation';
import { receiptRows } from './receipt-rows';

const donation: Donation = {
  id: 'd1',
  eventId: 'e1',
  receiptNumber: 'AMA-0001',
  donorName: 'Kofi Mensah',
  amountMinor: 40000,
  donationType: 'mobile_money',
  recordedBy: 'op-1',
  recordedAt: '2026-06-01T10:00:00.000Z',
  syncStatus: 'synced',
};

describe('receiptRows', () => {
  it('lists the receipt rows in print order, flagging only Amount for the Cedi font', () => {
    const rows = receiptRows(donation, 'Ama Operator');

    expect(rows.map(([label]) => label)).toEqual([
      'Receipt No.',
      'Date & Time',
      'Donor',
      'Amount',
      'Type',
      'Recorded By',
    ]);
    expect(rows.filter(([, , needsCediFont]) => needsCediFont).map(([label]) => label)).toEqual([
      'Amount',
    ]);
    expect(rows[3][1]).toContain('₵');
    expect(rows[4][1]).toBe('Mobile Money');
    expect(rows[5][1]).toBe('Ama Operator');
  });

  it('adds the on-behalf-of row just before Recorded By when present', () => {
    const rows = receiptRows({ ...donation, onBehalfOf: 'The Asante Family' }, 'Ama Operator');

    expect(rows.slice(-2)).toEqual([
      ['Donated On Behalf Of', 'The Asante Family'],
      ['Recorded By', 'Ama Operator'],
    ]);
  });
});
