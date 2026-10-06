import { makeDonation } from '../data/models/donation-test-fixtures';
import {
  NO_DONATION_FILTERS,
  distinctRecorders,
  filterDonations,
  hasNarrowingFilters,
} from './donation-filter.util';

describe('donation filters', () => {
  const donations = [
    makeDonation({ id: 'a', donorName: 'Ama Owusu', receiptNumber: 'FUN-0001' }),
    makeDonation({
      id: 'b',
      eventId: 'e2',
      receiptNumber: 'FUN-0002',
      donationType: 'mobile_money',
      recordedBy: 'op-2',
    }),
    makeDonation({ id: 'c', donorName: 'Kojo Mensah', receiptNumber: 'FUN-0042' }),
  ];
  const ids = (list: { id: string }[]) => list.map((d) => d.id);

  it('keeps everything when nothing is chosen', () => {
    expect(ids(filterDonations(donations, NO_DONATION_FILTERS))).toEqual(['a', 'b', 'c']);
  });

  it('narrows by event, type and recorder together', () => {
    expect(ids(filterDonations(donations, { ...NO_DONATION_FILTERS, eventId: 'e2' }))).toEqual([
      'b',
    ]);
    const cashByOp1 = { ...NO_DONATION_FILTERS, type: 'cash' as const, recorder: 'op-1' };
    expect(ids(filterDonations(donations, cashByOp1))).toEqual(['a', 'c']);
  });

  it('searches donor name and receipt number, ignoring case and outer spaces', () => {
    const byName = { ...NO_DONATION_FILTERS, search: '  kojo ' };
    const byReceipt = { ...NO_DONATION_FILTERS, search: '0001' };

    expect(ids(filterDonations(donations, byName))).toEqual(['c']);
    expect(ids(filterDonations(donations, byReceipt))).toEqual(['a']);
  });

  it('treats the event as a scope, not a narrowing filter', () => {
    expect(hasNarrowingFilters({ ...NO_DONATION_FILTERS, eventId: 'e1' })).toBe(false);
    expect(hasNarrowingFilters({ ...NO_DONATION_FILTERS, search: ' ' })).toBe(false);
    expect(hasNarrowingFilters({ ...NO_DONATION_FILTERS, recorder: 'op-1' })).toBe(true);
  });

  it('lists each recorder once', () => {
    expect(distinctRecorders(donations)).toEqual(['op-1', 'op-2']);
  });
});
