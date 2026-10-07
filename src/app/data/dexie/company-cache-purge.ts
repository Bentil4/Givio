import type { Models } from 'appwrite';
import { appDb } from './app-db';

/**
 * AD-12 (amended 2026-10-07): a platform Admin has no access to company Events or Donations,
 * so whatever an earlier session — or a build from before the amendment — cached on this
 * device is cleared as soon as an Admin is signed in. Only server-confirmed copies go: on a
 * device an Operator shares, the outbox, unsynced donations and the Events they belong to are
 * the only copy of donations not yet uploaded, so they stay for that Operator's next sync.
 * Never runs for anyone else.
 */
export async function purgeCompanyCacheIfAdmin(
  user: Models.User<Models.Preferences>,
): Promise<void> {
  if (!(user.labels ?? []).includes('admin')) {
    return;
  }
  await appDb.transaction('rw', appDb.events, appDb.donations, purgeSyncedCompanyRows);
}

async function purgeSyncedCompanyRows(): Promise<void> {
  const unsynced = await appDb.donations.filter((d) => d.syncStatus !== 'synced').toArray();
  const eventsWithUnsyncedWork = new Set(unsynced.map((donation) => donation.eventId));
  await appDb.donations.filter((d) => d.syncStatus === 'synced').delete();
  await appDb.events.filter((event) => !eventsWithUnsyncedWork.has(event.id)).delete();
}
