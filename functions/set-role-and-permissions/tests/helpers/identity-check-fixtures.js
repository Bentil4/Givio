import { seedStore, withEnv, run } from './team-management-fixtures.js';

// Story 7.2: the team-management fixtures (which already configure the empty IdentityFlags and
// review tables) plus seeded flags. The flags table is empty in production until Story 7.3
// writes to it, so every test seeds its own.

export const FLAGS = 'identity-flags-1';
export const REVIEWS = 'identity-reviews-1';

export const FLAGGED_PERSON = {
  $id: 'flag-1',
  name: 'kojo mensah',
  email: 'kojo.old@x.co',
  phone: '+233241234567',
  reason: 'Revoked for cause at another company',
  flaggedAt: '2026-09-01T00:00:00.000Z',
  sourceType: 'for_cause_revocation',
  flaggedByTenantId: 'tenant-b',
};

export function identityStore(flags = []) {
  const store = seedStore();
  store[FLAGS] = Object.fromEntries(flags.map((flag) => [flag.$id, { ...flag }]));
  return store;
}

/** The shared withEnv configures the identity tables; this runs `fn` as if they weren't. */
export function withoutIdentityTables(fn) {
  return withEnv(async () => {
    delete process.env.APPWRITE_IDENTITY_FLAGS_COLLECTION_ID;
    delete process.env.APPWRITE_IDENTITY_REVIEWS_COLLECTION_ID;
    await fn();
  });
}

export function reviews(store) {
  return Object.values(store[REVIEWS]);
}

export function membershipOf(store, userId) {
  return Object.values(store['memberships-1']).find((m) => m.userId === userId);
}

/** Runs each step against the same store and Accounts, as successive real requests would. */
export async function runSteps({ store, steps, accounts: initialAccounts }) {
  let accounts = initialAccounts;
  const results = [];
  for (const step of steps) {
    const outcome = await run({ ...step, store, accounts });
    accounts = outcome.accountStore;
    results.push(outcome);
  }
  return results;
}

export const resolve = (reviewId, decision) => ({
  action: 'resolveIdentityReview',
  reviewId,
  decision,
});

/**
 * The shared fake mints `new-1` afresh per request, so a second add in the same store would
 * reuse it. Moves the first add's Account (and every row naming it) to `userId` first.
 */
export function renameAddedAccount({ store, accounts, userId }) {
  const renamed = { ...accounts, [userId]: { ...accounts['new-1'], $id: userId } };
  delete renamed['new-1'];
  for (const row of [...Object.values(store['memberships-1']), ...reviews(store)]) {
    row.userId = row.userId === 'new-1' ? userId : row.userId;
  }
  return renamed;
}
