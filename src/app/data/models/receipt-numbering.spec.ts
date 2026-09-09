import { eventShortCode, provisionalReceiptNumber } from './receipt-numbering';

describe('eventShortCode', () => {
  it('prefixes a wedding with WED', () => {
    expect(eventShortCode({ id: 'abcd1234', type: 'wedding' })).toBe('WED1234');
  });

  it('prefixes a funeral with FUN', () => {
    expect(eventShortCode({ id: 'abcd1234', type: 'funeral' })).toBe('FUN1234');
  });

  it('strips non-alphanumeric characters before taking the suffix', () => {
    expect(eventShortCode({ id: 'ab-cd-12-34', type: 'wedding' })).toBe('WED1234');
  });

  it('is deterministic for the same event', () => {
    const event = { id: 'e1', type: 'wedding' as const };
    expect(eventShortCode(event)).toBe(eventShortCode(event));
  });
});

describe('provisionalReceiptNumber', () => {
  it('formats as {shortCode}-P{n}', () => {
    expect(provisionalReceiptNumber({ id: 'abcd1234', type: 'wedding' }, 7)).toBe('WED1234-P7');
  });
});
