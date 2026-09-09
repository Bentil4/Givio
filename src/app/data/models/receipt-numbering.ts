import type { Event } from './event';

/**
 * AD-8's "event short code" — a stable, deterministic prefix derived purely from fields the
 * client already has (no server round-trip needed to print a receipt while offline). The
 * equivalent is duplicated in functions/set-role-and-permissions/src/donation-recording.js
 * (no shared module system between the Function and the Angular app) — keep both in sync by
 * hand, the same convention shared.js's VALID_ROLES comment documents for auth.service.ts.
 */
export function eventShortCode(event: Pick<Event, 'id' | 'type'>): string {
  const prefix = event.type === 'wedding' ? 'WED' : 'FUN';
  const suffix = event.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  return `${prefix}${suffix}`;
}

/** e.g. `WED42AB-P3` — shown with a "provisional" marker until the Function assigns a canonical number. */
export function provisionalReceiptNumber(event: Pick<Event, 'id' | 'type'>, sequence: number): string {
  return `${eventShortCode(event)}-P${sequence}`;
}
