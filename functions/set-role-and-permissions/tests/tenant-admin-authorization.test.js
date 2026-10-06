import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDonationRecordingRequest } from '../src/donation-recording.js';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import {
  designate,
  fakeContext,
  run,
  seedStore,
  setStatus,
  suspend,
  withEnv,
} from './helpers/tenant-suspension-fixtures.js';

// Story 8.1 (FR-19): no Organizer or Operator, at any tenant, can change a tenant's account
// state — the Function refuses it whatever the UI shows. Story 9.2 AC3: a suspended tenant's
// members are refused server-side and told why by getMyTenantStatus.

const NON_ADMIN_CALLERS = [
  ['a Super Organizer', 'so-a'],
  ['an Organizer', 'org-a'],
  ['an Operator', 'op-a'],
  ["another tenant's Super Organizer", 'so-b'],
];

const ADMIN_ONLY_REQUESTS = [
  ['suspend their own tenant', suspend('tenant-a')],
  ['suspend another tenant', suspend('tenant-b')],
  ['approve a pending tenant', setStatus('approved', 'tenant-p')],
  ['suspend via setTenantStatus', setStatus('suspended', 'tenant-b')],
  ['designate a Super Organizer', designate('m-org-a')],
];

for (const [who, as] of NON_ADMIN_CALLERS) {
  for (const [what, body] of ADMIN_ONLY_REQUESTS) {
    test(
      `${who} cannot ${what} (403, nothing written)`,
      withEnv(async () => {
        const store = seedStore();
        const before = structuredClone(store);

        const { result, calls } = await run({ body, as, store });

        assert.equal(result.status, 403);
        assert.equal(calls.updateRow, undefined);
        assert.equal(calls.deleteSessions, undefined);
        assert.deepEqual(store, before);
      }),
    );
  }
}

test(
  "getMyTenantStatus tells a suspended tenant's Operator their company is suspended",
  withEnv(async () => {
    const store = seedStore();
    await run({ body: suspend(), store });

    const { result } = await run({ body: { action: 'getMyTenantStatus' }, as: 'op-a', store });

    assert.equal(result.status, 200);
    assert.equal(result.body.tenantStatus, 'suspended');
  }),
);

test(
  'getMyTenantStatus reports an approved tenant as approved, and nothing for a non-member',
  withEnv(async () => {
    const member = await run({ body: { action: 'getMyTenantStatus' }, as: 'op-b' });
    const nobody = await run({ body: { action: 'getMyTenantStatus' }, as: 'nobody' });

    assert.equal(member.result.body.tenantStatus, 'approved');
    assert.equal(nobody.result.status, 200);
    assert.equal(nobody.result.body.tenantStatus, null);
  }),
);

test(
  'getMyTenantStatus discloses nothing to a revoked member',
  withEnv(async () => {
    const { result } = await run({ body: { action: 'getMyTenantStatus' }, as: 'gone-a' });

    assert.equal(result.body.tenantStatus, null);
  }),
);

test(
  'getMyTenantStatus fails closed (502) when the lookup fails',
  withEnv(async () => {
    const { result } = await run({
      body: { action: 'getMyTenantStatus' },
      as: 'op-a',
      failOn: { listRows: true },
    });

    assert.equal(result.status, 502);
  }),
);

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

function storeWithIdentities() {
  const store = seedStore();
  Object.assign(store['tenants-1']['tenant-a'], { name: 'Adom Funerals', logo: LOGO });
  Object.assign(store['tenants-1']['tenant-b'], { name: 'Bliss Weddings', logo: 'other' });
  return store;
}

test(
  "getMyTenantStatus returns only the caller's own tenant's name and logo",
  withEnv(async () => {
    const store = storeWithIdentities();

    const { result } = await run({ body: { action: 'getMyTenantStatus' }, as: 'op-a', store });

    assert.deepEqual(result.body, {
      success: true,
      tenantStatus: 'approved',
      tenantName: 'Adom Funerals',
      logo: LOGO,
    });
  }),
);

test(
  'getMyTenantStatus returns a null logo for a tenant without one, and no identity to nobody',
  withEnv(async () => {
    const member = await run({ body: { action: 'getMyTenantStatus' }, as: 'op-b' });
    const nobody = await run({ body: { action: 'getMyTenantStatus' }, as: 'nobody' });

    assert.equal(member.result.body.logo, null);
    assert.equal(nobody.result.body.tenantName, null);
    assert.equal(nobody.result.body.logo, null);
  }),
);

test(
  "getMyTenantStatus logs the tenant's name but never its logo data URL",
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'getMyTenantStatus' },
      as: 'op-a',
      store: storeWithIdentities(),
    });
    const logs = [];
    ctx.log = (message) => logs.push(message);

    await handleTenantMembershipRequest(ctx);

    assert.ok(logs.some((message) => message.includes('Adom Funerals')));
    assert.ok(logs.every((message) => !message.includes(LOGO)));
  }),
);

test(
  "a suspended tenant's Operator is refused when recording a donation (Story 9.2 AC3)",
  withEnv(async () => {
    const store = seedStore();
    await run({ body: suspend(), store });

    const { result, calls } = await run(
      {
        body: {
          action: 'recordDonation',
          donationId: 'd1',
          eventId: 'event-a1',
          receiptNumber: 'P-1',
          donorName: 'Ama',
          amountMinor: 5000,
          donationType: 'cash',
          recordedAt: '2026-01-01T00:00:00.000Z',
        },
        as: 'op-a',
        store,
      },
      handleDonationRecordingRequest,
    );

    assert.equal(result.status, 403);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  "a suspended tenant's Organizer is refused team management (Story 9.2 AC3)",
  withEnv(async () => {
    const store = seedStore();
    await run({ body: suspend(), store });

    const { result } = await run({ body: { action: 'listTeamMembers' }, as: 'so-a', store });

    assert.equal(result.status, 403);
  }),
);
