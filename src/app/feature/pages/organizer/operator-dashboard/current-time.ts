import { DestroyRef, inject, signal, type Signal } from '@angular/core';

const ONE_MINUTE_MS = 60_000;

/**
 * The time now, refreshed every minute, so "today" and the current hour roll over on a desk
 * left open past midnight or the top of the hour. Call from an injection context.
 */
export function minuteClock(): Signal<Date> {
  const now = signal(new Date());
  const timer = setInterval(() => now.set(new Date()), ONE_MINUTE_MS);
  inject(DestroyRef).onDestroy(() => clearInterval(timer));
  return now.asReadonly();
}
