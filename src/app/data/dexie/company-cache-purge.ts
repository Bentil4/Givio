import type { Models } from 'appwrite';
import { appDb } from './app-db';

/**
 * AD-12 (amended 2026-10-07): a platform Admin has no access to company Events or Donations,
 * so whatever an earlier session — or a build from before the amendment — cached on this
 * device is cleared as soon as an Admin is signed in. Never runs for anyone else: on an
 * Operator's device the cache and outbox hold the only copy of donations not yet synced.
 */
export async function purgeCompanyCacheIfAdmin(
  user: Models.User<Models.Preferences>,
): Promise<void> {
  if (!(user.labels ?? []).includes('admin')) {
    return;
  }
  await appDb.transaction('rw', appDb.events, appDb.donations, appDb.outbox, () =>
    Promise.all([appDb.events.clear(), appDb.donations.clear(), appDb.outbox.clear()]),
  );
}
