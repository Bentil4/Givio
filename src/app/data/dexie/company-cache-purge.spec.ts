import type { Models } from 'appwrite';
import { appDb } from './app-db';
import { purgeCompanyCacheIfAdmin } from './company-cache-purge';
import type { Donation } from '../models/donation';
import type { Event } from '../models/event';
import type { OutboxEntry } from '../models/outbox-entry';

const asUser = (labels: string[]) => ({ $id: 'u1', labels }) as Models.User<Models.Preferences>;

const PENDING_DONATION: OutboxEntry = {
  entityType: 'donation',
  entityId: 'd1',
  op: 'create',
  payload: {},
  status: 'pending',
  retries: 0,
  createdAt: '2026-10-07T10:00:00.000Z',
};

async function seedCompanyCache(): Promise<void> {
  await appDb.events.put({ id: 'e1', tenantId: 'tenant-a' } as Event);
  await appDb.donations.put({ id: 'd1', eventId: 'e1' } as Donation);
  await appDb.outbox.add(PENDING_DONATION);
}

async function cachedRowCount(): Promise<number> {
  const counts = await Promise.all([
    appDb.events.count(),
    appDb.donations.count(),
    appDb.outbox.count(),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

describe('purgeCompanyCacheIfAdmin (AD-12, amended 2026-10-07)', () => {
  beforeEach(async () => {
    await Promise.all([appDb.events.clear(), appDb.donations.clear(), appDb.outbox.clear()]);
    await seedCompanyCache();
  });

  it('clears cached Events, Donations and the outbox for an Admin', async () => {
    await purgeCompanyCacheIfAdmin(asUser(['admin']));

    expect(await cachedRowCount()).toBe(0);
  });

  it('clears them for the Super Admin too', async () => {
    await purgeCompanyCacheIfAdmin(asUser(['admin', 'superadmin']));

    expect(await cachedRowCount()).toBe(0);
  });

  it("never touches an Operator's or an Organizer's cache", async () => {
    await purgeCompanyCacheIfAdmin(asUser(['operator']));
    await purgeCompanyCacheIfAdmin(asUser([]));

    expect(await cachedRowCount()).toBe(3);
  });
});
