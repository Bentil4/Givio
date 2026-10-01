import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  designate,
  run,
  seedStore,
  suspend,
  withEnv,
} from './helpers/tenant-suspension-fixtures.js';

// Story 8.1: a tenant whose sole Super Organizer was revoked is never left orphaned — Admin
// designates an existing active Organizer, updating the Membership, the Tenant row and its read
// grant together.

function orphanedStore() {
  const store = seedStore();
  store['memberships-1']['m-so-a'].status = 'revoked';
  store['tenants-1']['tenant-a'].$permissions = ['read("label:admin")', 'read("user:org-a")'];
  return store;
}

test(
  "designateSuperOrganizer promotes an active Organizer and makes them the tenant's Super Organizer",
  withEnv(async () => {
    const store = orphanedStore();

    const { result } = await run({ body: designate('m-org-a'), store });

    assert.equal(result.status, 200);
    assert.equal(result.body.superOrganizerId, 'org-a');
    assert.equal(store['memberships-1']['m-org-a'].role, 'super_organizer');
    assert.equal(store['memberships-1']['m-org-a'].status, 'active');
    assert.equal(store['tenants-1']['tenant-a'].superOrganizerId, 'org-a');
    assert.deepEqual(store['tenants-1']['tenant-a'].$permissions, [
      'read("label:admin")',
      'read("user:org-a")',
    ]);
  }),
);

test(
  'designateSuperOrganizer works on a suspended tenant under investigation',
  withEnv(async () => {
    const store = orphanedStore();
    await run({ body: suspend(), store });

    const { result } = await run({ body: designate('m-org-a'), store });

    assert.equal(result.status, 200);
    assert.equal(store['tenants-1']['tenant-a'].status, 'suspended');
  }),
);

test(
  'designateSuperOrganizer refuses while another active Super Organizer exists',
  withEnv(async () => {
    const { result, calls } = await run({ body: designate('m-org-a') });

    assert.equal(result.status, 409);
    assert.match(result.body.error, /already has an active Super Organizer/);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'designateSuperOrganizer refuses an Operator, a revoked member and a pending tenant',
  withEnv(async () => {
    const store = orphanedStore();
    const cases = [designate('m-op-a'), designate('m-gone-a'), designate('m-so-p', 'tenant-p')];

    for (const body of cases) {
      const { result, calls } = await run({ body, store });
      assert.equal(result.status, 409, JSON.stringify(body));
      assert.equal(calls.updateRow, undefined);
    }
  }),
);

test(
  "designateSuperOrganizer treats another tenant's Membership as not found",
  withEnv(async () => {
    const { result, calls } = await run({ body: designate('m-op-b'), store: orphanedStore() });

    assert.equal(result.status, 404);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'designateSuperOrganizer returns 404 for an unknown tenant or membership',
  withEnv(async () => {
    const tenant = await run({ body: designate('m-org-a', 'tenant-x') });
    const membership = await run({ body: designate('m-missing') });

    assert.equal(tenant.result.status, 404);
    assert.equal(membership.result.status, 404);
  }),
);

test(
  'designateSuperOrganizer requires both tenantId and membershipId',
  withEnv(async () => {
    const { result } = await run({ body: { action: 'designateSuperOrganizer', tenantId: 'a' } });

    assert.equal(result.status, 400);
  }),
);

test(
  'a designation that failed part-way is completed by re-running it',
  withEnv(async () => {
    const store = orphanedStore();
    const failed = await run({
      body: designate('m-org-a'),
      store,
      failOn: { updateRow: (args) => args.tableId === 'tenants-1' },
    });
    assert.equal(failed.result.status, 502);
    assert.equal(store['memberships-1']['m-org-a'].role, 'super_organizer');

    const retried = await run({ body: designate('m-org-a'), store });

    assert.equal(retried.result.status, 200);
    assert.equal(store['tenants-1']['tenant-a'].superOrganizerId, 'org-a');
  }),
);
