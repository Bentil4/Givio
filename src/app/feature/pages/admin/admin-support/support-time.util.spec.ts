import { relativeTimeSince } from './support-time.util';

describe('relativeTimeSince', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const at = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  it('words recent times in minutes, hours and days', () => {
    expect(relativeTimeSince(at(10_000), now)).toBe('just now');
    expect(relativeTimeSince(at(60_000), now)).toBe('1 minute ago');
    expect(relativeTimeSince(at(5 * 60_000), now)).toBe('5 minutes ago');
    expect(relativeTimeSince(at(3 * 3_600_000), now)).toBe('3 hours ago');
    expect(relativeTimeSince(at(2 * 86_400_000), now)).toBe('2 days ago');
  });

  it('gives up on anything older than 30 days or unparseable', () => {
    expect(relativeTimeSince(at(31 * 86_400_000), now)).toBeNull();
    expect(relativeTimeSince('not a date', now)).toBeNull();
  });
});
