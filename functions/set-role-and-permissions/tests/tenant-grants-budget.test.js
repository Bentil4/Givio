import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import { recomputeTenantReadGrants, MAX_ROW_PERMISSIONS } from '../src/tenant-grants.js';
import { createTimeBudget } from '../src/bounded-work.js';
import {
  withEnv,
  invoke,
  membership,
  donation,
  tenantFixture,
  backfill,
} from './helpers/tenant-read-grants-fixtures.js';

const MANY_ORGANIZERS = Array.from({ length: MAX_ROW_PERMISSIONS + 20 }, (_, i) =>
  membership(`m-${i}`, `org-${i}`, 'organizer'),
);

function manyDonationsFixture(count) {
  const store = tenantFixture();
  store.tables['donations-1'].push(
    ...Array.from({ length: count }, (_, i) => donation(`bulk-${i}`, 'e1')),
  );
  return store;
}

/** A fake clock that moves forward one tick per Donation/Event row written. */
function tickingStore(store, clock) {
  const { TablesDBCtor } = store;
  class TickingTablesDBCtor extends TablesDBCtor {
    async updateRow(args) {
      clock.time += 1;
      return super.updateRow(args);
    }
  }
  return TickingTablesDBCtor;
}

function sweepOptions({ DatabasesCtor, budget }) {
  return { DatabasesCtor, adminClient: {}, tenantId: 't1', force: true, error: () => {}, budget };
}

test(
  'a sweep that runs out of time stops, reports timedOut and what is left, and a retry converges',
  withEnv(async () => {
    const store = manyDonationsFixture(40);
    const clock = { time: 0 };
    const DatabasesCtor = tickingStore(store, clock);
    const budget = createTimeBudget({ now: () => clock.time, budgetMs: 12 });

    const first = await recomputeTenantReadGrants(sweepOptions({ DatabasesCtor, budget }));

    assert.equal(first.ok, false);
    assert.equal(first.timedOut, true);
    assert.ok(first.remaining > 0);
    assert.equal(first.failureCount, 0);
    const staleEvent = store.tables['events-1'].find((e) => e.$id === 'e1');
    assert.ok(
      !staleEvent.$permissions.includes('read("user:org-1")'),
      'Event left stale as marker',
    );

    const retryBudget = createTimeBudget({ now: () => clock.time, budgetMs: 10_000 });
    const second = await recomputeTenantReadGrants(
      sweepOptions({ DatabasesCtor, budget: retryBudget }),
    );

    assert.equal(second.ok, true);
    assert.equal(second.timedOut, false);
    assert.equal(second.remaining, 0);
    for (const row of [...store.tables['events-1'], ...store.tables['donations-1']]) {
      assert.ok(row.$permissions.includes('read("user:org-1")'), `${row.$id} converged`);
    }
  }),
);

test(
  'a sweep within its budget is unchanged: ok, not timed out',
  withEnv(async () => {
    const store = tenantFixture();
    const budget = createTimeBudget({ now: () => 0, budgetMs: 1 });

    const result = await recomputeTenantReadGrants(
      sweepOptions({ DatabasesCtor: store.TablesDBCtor, budget }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.timedOut, false);
  }),
);

test(
  'Donation rewrites run in parallel, capped at 10 in flight',
  withEnv(async () => {
    const store = manyDonationsFixture(60);
    let inFlight = 0;
    let peak = 0;
    class SlowTablesDBCtor extends store.TablesDBCtor {
      async updateRow(args) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setImmediate(resolve));
        inFlight -= 1;
        return super.updateRow(args);
      }
    }
    const budget = createTimeBudget();

    const result = await recomputeTenantReadGrants(
      sweepOptions({ DatabasesCtor: SlowTablesDBCtor, budget }),
    );

    assert.equal(result.ok, true);
    assert.equal(peak, 10);
  }),
);

test(
  'the Admin backfill surfaces truncatedEventIds at the top of its response',
  withEnv(async () => {
    const store = tenantFixture({ memberships: MANY_ORGANIZERS });

    const result = await backfill(store, { tenantId: 't1' });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.truncatedEventIds, ['e1', 'e2']);
  }),
);

test(
  'approving a tenant whose grants were capped stays 200 but reports truncatedEventIds',
  withEnv(async () => {
    const store = tenantFixture({ tenantStatus: 'pending', memberships: MANY_ORGANIZERS });

    const result = await invoke(handleTenantMembershipRequest, store, {
      action: 'setTenantStatus',
      tenantId: 't1',
      status: 'approved',
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.truncatedEventIds, ['e1', 'e2']);
  }),
);

test(
  'adding a member to a capped tenant stays 200 but reports truncatedEventIds',
  withEnv(async () => {
    const store = tenantFixture({ memberships: MANY_ORGANIZERS });

    const result = await invoke(handleTenantMembershipRequest, store, {
      action: 'createMembership',
      userId: 'org-new',
      tenantId: 't1',
      role: 'organizer',
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.truncatedEventIds, ['e1', 'e2']);
  }),
);

test(
  'revoking a member of a capped tenant stays 200 but reports truncatedEventIds',
  withEnv(async () => {
    const store = tenantFixture({ memberships: MANY_ORGANIZERS });

    const result = await invoke(handleTenantMembershipRequest, store, {
      action: 'revokeMembership',
      reason: 'routine',
      membershipId: 'm-0',
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.truncatedEventIds, ['e1', 'e2']);
  }),
);

test(
  'an uncapped tenant adds no truncatedEventIds field',
  withEnv(async () => {
    const store = tenantFixture();

    const result = await invoke(handleTenantMembershipRequest, store, {
      action: 'setTenantStatus',
      tenantId: 't1',
      status: 'approved',
    });

    assert.equal(result.status, 200);
    assert.equal('truncatedEventIds' in result.body, false);
  }),
);
