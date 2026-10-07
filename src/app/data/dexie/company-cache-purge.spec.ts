import type { Models } from 'appwrite';
import { appDb } from './app-db';
import { purgeCompanyCacheIfAdmin } from './company-cache-purge';
import type { Donation } from '../models/donation';
import type { Event } from '../models/event';
import type { OutboxEntry } from '../models/outbox-entry';

const asUser = (labels: string[]) => ({ $id: 'u1', labels }) as Models.User<Models.Preferences>;

const PENDING_DONATION: OutboxEntry = {
  entityType: 'donation',
  entityId: 'd2',
  op: 'create',
  payload: {},
  status: 'pending',
  retries: 0,
  createdAt: '2026-10-07T10:00:00.000Z',
};

/** e1 holds only synced work; e2 holds a donation still waiting in the outbox. */
async function seedCompanyCache(): Promise<void> {
  await appDb.events.bulkPut([
    { id: 'e1', tenantId: 'tenant-a' } as Event,
    { id: 'e2', tenantId: 'tenant-a' } as Event,
  ]);
  await appDb.donations.bulkPut([
    { id: 'd1', eventId: 'e1', syncStatus: 'synced' } as Donation,
    { id: 'd2', eventId: 'e2', syncStatus: 'pending' } as Donation,
  ]);
  await appDb.outbox.add(PENDING_DONATION);
}

async function remainingIds() {
  const [events, donations] = await Promise.all([
    appDb.events.toCollection().primaryKeys(),
    appDb.donations.toCollection().primaryKeys(),
  ]);
  return { events, donations, outbox: await appDb.outbox.count() };
}

describe('purgeCompanyCacheIfAdmin (AD-12, amended 2026-10-07)', () => {
  beforeEach(async () => {
    await Promise.all([appDb.events.clear(), appDb.donations.clear(), appDb.outbox.clear()]);
    await seedCompanyCache();
  });

  it('clears synced Events and Donations for an Admin', async () => {
    await purgeCompanyCacheIfAdmin(asUser(['admin']));

    const remaining = await remainingIds();
    expect(remaining.donations).not.toContain('d1');
    expect(remaining.events).not.toContain('e1');
  });

  it("keeps an Operator's unsynced donation, its Event and the outbox on a shared device", async () => {
    await purgeCompanyCacheIfAdmin(asUser(['admin', 'superadmin']));

    expect(await remainingIds()).toEqual({ events: ['e2'], donations: ['d2'], outbox: 1 });
  });

  it("never touches an Operator's or an Organizer's cache", async () => {
    await purgeCompanyCacheIfAdmin(asUser(['operator']));
    await purgeCompanyCacheIfAdmin(asUser([]));

    expect(await remainingIds()).toEqual({
      events: ['e1', 'e2'],
      donations: ['d1', 'd2'],
      outbox: 1,
    });
  });
});
