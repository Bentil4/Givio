const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_LIMIT_DAYS = 30;

/** "5 minutes ago"; null once it is old enough that only the absolute date is useful. */
export function relativeTimeSince(isoTimestamp: string, nowMs: number): string | null {
  const elapsed = nowMs - Date.parse(isoTimestamp);
  if (Number.isNaN(elapsed)) return null;
  if (elapsed < MINUTE_MS) return 'just now';
  if (elapsed < HOUR_MS) return ago(Math.floor(elapsed / MINUTE_MS), 'minute');
  if (elapsed < DAY_MS) return ago(Math.floor(elapsed / HOUR_MS), 'hour');
  const days = Math.floor(elapsed / DAY_MS);
  return days <= RELATIVE_LIMIT_DAYS ? ago(days, 'day') : null;
}

function ago(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}
