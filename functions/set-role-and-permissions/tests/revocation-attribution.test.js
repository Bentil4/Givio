import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { seedStore, withEnv, add, run } from './helpers/team-management-fixtures.js';
import {
  FLAGS,
  FLAGGED_PERSON,
  identityStore,
  reviews,
  runSteps,
  resolve,
} from './helpers/identity-check-fixtures.js';

// Story 7.3 (FR-13): revoking anyone, for any reason, leaves every donation they recorded
// attributed to them exactly as before, and no product path deletes an Account a donation names.

const SRC = new URL('../src/', import.meta.url).pathname;

function storeWithDonations() {
  const store = seedStore();
  store['donations-1'] = {
    'donation-1': {
      $id: 'donation-1',
      eventId: 'event-a1',
      tenantId: 'tenant-a',
      recordedBy: 'op-a',
      amount: 200,
    },
    'donation-2': {
      $id: 'donation-2',
      eventId: 'event-a1',
      tenantId: 'tenant-a',
      recordedBy: 'org-a',
      amount: 50,
    },
  };
  return store;
}

const recorders = (store) => Object.values(store['donations-1']).map((d) => d.recordedBy);

for (const reason of ['routine', 'for_cause']) {
  test(
    `a ${reason} revoke rewrites no donation's recorder and leaves the Account's name as it was`,
    withEnv(async () => {
      const store = storeWithDonations();
      const body = {
        action: 'revokeMembership',
        membershipId: 'm-op-a',
        reason,
        explanation: 'Under investigation',
      };
      const { result, accountStore, calls } = await run({ body, as: 'so-a', store });

      assert.equal(result.status, 200);
      assert.deepEqual(recorders(store), ['op-a', 'org-a']);
      assert.equal(accountStore['op-a'].name, 'Kwesi Boateng');
      assert.equal(accountStore['op-a'].$id, 'op-a');
      const donationWrites = (calls.updateRow ?? []).filter(
        ([args]) => args.tableId === 'donations-1',
      );
      assert.ok(donationWrites.every(([args]) => !('recordedBy' in (args.data ?? {}))));
    }),
  );
}

test(
  'Admin confirming a flagged addition revokes it as routine — the match is already on record, so it adds no flag',
  withEnv(async () => {
    const store = identityStore([FLAGGED_PERSON]);
    const [added] = await runSteps({ store, steps: [{ body: add('operator'), as: 'so-a' }] });
    const review = reviews(store)[0];
    const [confirmed] = await runSteps({
      store,
      accounts: added.accountStore,
      steps: [{ body: resolve(review.$id, 'confirm'), as: 'admin-1' }],
    });

    assert.equal(confirmed.result.status, 200);
    assert.deepEqual(Object.keys(store[FLAGS]), [FLAGGED_PERSON.$id]);
    assert.equal(confirmed.accountStore[review.userId].status, false);
  }),
);

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)],
    ),
  );
  return nested.flat().filter((file) => file.endsWith('.js'));
}

test('the only Account deletes in the Function roll back a signup that failed before any Membership existed', async () => {
  const deleters = [];
  for (const file of await sourceFiles(SRC)) {
    const source = await readFile(file, 'utf8');
    if (source.includes('users.delete(')) {
      deleters.push(file.slice(SRC.length));
    }
  }
  assert.deepEqual(deleters, ['tenant-membership/onboarding.js']);
});
