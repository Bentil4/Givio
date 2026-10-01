import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, seedStore, withEnv, add, run } from './helpers/team-management-fixtures.js';
import { FLAGS, membershipOf, runSteps } from './helpers/identity-check-fixtures.js';

// Story 7.3 (FR-13/FR-24): every revoke is routine or for-cause, enforced server-side; only a
// for-cause revoke feeds IdentityFlags, in the normalized form Story 7.2's screening looks up.

const revoke = (membershipId, extra = {}) => ({
  action: 'revokeMembership',
  membershipId,
  ...extra,
});

const forCause = (membershipId, explanation = 'Pocketed cash at the Asante funeral') =>
  revoke(membershipId, { reason: 'for_cause', explanation });

const flags = (store) => Object.values(store[FLAGS]);

test(
  'a revoke without a valid reason, or a for-cause one without an explanation, is refused before anything changes',
  withEnv(async () => {
    for (const body of [
      revoke('m-op-a'),
      revoke('m-op-a', { reason: 'generic' }),
      revoke('m-op-a', { reason: 'for_cause' }),
      revoke('m-op-a', { reason: 'for_cause', explanation: '   ' }),
      revoke('m-op-a', { reason: 'for_cause', explanation: 42 }),
      forCause('m-op-a', 'x'.repeat(501)),
    ]) {
      const { result, calls, store } = await run({ body, as: 'so-a' });
      assert.equal(result.status, 400, JSON.stringify(body).slice(0, 80));
      assert.equal(calls.updateRow, undefined);
      assert.equal(store['memberships-1']['m-op-a'].status, 'active');
    }
  }),
);

test(
  'Admin must state the reason too',
  withEnv(async () => {
    const { result } = await run({ body: revoke('m-so-b'), as: 'admin-1' });
    assert.equal(result.status, 400);
  }),
);

test(
  'a routine revoke removes access, blocks sign-in and ends sessions, but never flags anyone',
  withEnv(async () => {
    const { result, store, calls, accountStore } = await run({
      body: revoke('m-op-a', { reason: 'routine' }),
      as: 'so-a',
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.reason, 'routine');
    assert.equal(store['memberships-1']['m-op-a'].status, 'revoked');
    assert.equal(accountStore['op-a'].status, false);
    assert.deepEqual(calls.usersDeleteSessions, [[{ userId: 'op-a' }]]);
    assert.deepEqual(flags(store), []);
  }),
);

test(
  'a for-cause revoke writes one IdentityFlags row in normalizeIdentity form, attributed to the tenant',
  withEnv(async () => {
    const accounts = structuredClone(ACCOUNTS);
    Object.assign(accounts['op-a'], {
      name: '  Kwesi   BOATENG ',
      email: ' Kwesi@A.co ',
      phone: '+233 24 123 4567',
    });
    const { result, store } = await run({
      body: forCause('m-op-a', '  Pocketed cash at the Asante funeral  '),
      as: 'org-a',
      accounts,
    });

    assert.equal(result.status, 200);
    const [flag] = flags(store);
    assert.equal(flags(store).length, 1);
    assert.deepEqual(
      { ...flag, flaggedAt: typeof flag.flaggedAt },
      {
        $id: 'm-op-a',
        name: 'kwesi boateng',
        email: 'kwesi@a.co',
        phone: '+233241234567',
        reason: 'Pocketed cash at the Asante funeral',
        flaggedAt: 'string',
        sourceType: 'for_cause_revocation',
        flaggedByTenantId: 'tenant-a',
        $permissions: undefined,
      },
    );
  }),
);

test(
  'an Account with no phone is flagged with a null phone, never an empty string',
  withEnv(async () => {
    const { store } = await run({ body: forCause('m-org-a'), as: 'so-a' });
    assert.equal(flags(store)[0].phone, null);
    assert.equal(flags(store)[0].email, 'ama@a.co');
  }),
);

test(
  'someone revoked for cause is held for review when another company adds them as an Operator (FR-24 → FR-23)',
  withEnv(async () => {
    const store = seedStore();
    const [, added] = await runSteps({
      store,
      steps: [
        { body: forCause('m-op-a'), as: 'so-a' },
        { body: add('operator', { name: 'Kwesi Boateng', email: 'kwesi@a.co' }), as: 'so-b' },
      ],
    });

    assert.equal(added.result.status, 200);
    assert.equal(membershipOf(store, added.result.body.userId).status, 'pending_review');
  }),
);

test(
  'someone offboarded routinely is added at another company without being held',
  withEnv(async () => {
    const store = seedStore();
    const [, added] = await runSteps({
      store,
      steps: [
        { body: revoke('m-op-a', { reason: 'routine' }), as: 'so-a' },
        { body: add('operator', { name: 'Kwesi Boateng', email: 'kwesi@a.co' }), as: 'so-b' },
      ],
    });

    assert.equal(membershipOf(store, added.result.body.userId).status, 'active');
  }),
);

test(
  'a failed session revocation is a 502 naming the step, the other steps still run, and a retry finishes with one flag',
  withEnv(async () => {
    const store = seedStore();
    const failed = await run({
      body: forCause('m-op-a'),
      as: 'so-a',
      store,
      failOn: { usersDeleteSessions: true },
    });
    assert.equal(failed.result.status, 502);
    assert.deepEqual(failed.result.body.failedSteps, ['sessions']);
    assert.equal(store['memberships-1']['m-op-a'].status, 'revoked');
    assert.deepEqual(failed.accountStore['op-a'].labels, []);
    assert.equal(flags(store).length, 1);

    const retry = await run({ body: forCause('m-op-a'), as: 'so-a', store });
    assert.equal(retry.result.status, 200);
    assert.deepEqual(retry.calls.usersDeleteSessions, [[{ userId: 'op-a' }]]);
    assert.equal(flags(store).length, 1);
  }),
);

test(
  'a failed flag write is reported and retryable — the revoke is never silently routine',
  withEnv(async () => {
    const store = seedStore();
    const failed = await run({
      body: forCause('m-op-a'),
      as: 'so-a',
      store,
      failOn: { createRow: true },
    });
    assert.equal(failed.result.status, 502);
    assert.deepEqual(failed.result.body.failedSteps, ['identity flag']);

    const retry = await run({ body: forCause('m-op-a'), as: 'so-a', store });
    assert.equal(retry.result.status, 200);
    assert.equal(flags(store).length, 1);
  }),
);

test(
  'a routine revoke later re-sent as for-cause adds the flag',
  withEnv(async () => {
    const store = seedStore();
    await runSteps({
      store,
      steps: [
        { body: revoke('m-op-a', { reason: 'routine' }), as: 'so-a' },
        { body: forCause('m-op-a'), as: 'so-a' },
      ],
    });
    assert.equal(flags(store).length, 1);
  }),
);

test(
  'a for-cause revoke is refused before revoking when the IdentityFlags table is not configured',
  withEnv(async () => {
    delete process.env.APPWRITE_IDENTITY_FLAGS_COLLECTION_ID;
    const { result, store } = await run({ body: forCause('m-op-a'), as: 'so-a' });

    assert.equal(result.status, 500);
    assert.equal(store['memberships-1']['m-op-a'].status, 'active');
  }),
);

test(
  "the caller's role limits still apply to a for-cause revoke",
  withEnv(async () => {
    const { result, store } = await run({ body: forCause('m-org-a'), as: 'org-a' });

    assert.equal(result.status, 403);
    assert.deepEqual(flags(store), []);
  }),
);
