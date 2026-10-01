import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withEnv, add, run, newMembership } from './helpers/team-management-fixtures.js';
import {
  FLAGGED_PERSON,
  identityStore,
  withoutIdentityTables,
  reviews,
  runSteps,
} from './helpers/identity-check-fixtures.js';
import { normalizeIdentity } from '../src/tenant-membership/identity-check.js';

// Story 7.2 (FR-12/FR-23): every Organizer-tier team addition is screened before it takes
// effect, and a match is indistinguishable from a clean add from the adder's side.

const tenantReaders = (store) => store['tenants-1']['tenant-a'].$permissions;

test(
  'a co-Organizer addition with no match is active, gets its access, and is still recorded for Admin (FR-12: every time)',
  withEnv(async () => {
    const store = identityStore([FLAGGED_PERSON]);
    const { result } = await run({ body: add('operator'), as: 'so-a', store: identityStore() });
    const outcome = await run({
      body: add('organizer', { name: 'Esi Arthur', email: 'esi@a.co' }),
      as: 'so-a',
      store,
    });

    assert.equal(outcome.result.status, 200);
    const membership = newMembership(store);
    assert.equal(membership.status, 'active');
    assert.ok(tenantReaders(store).includes(`read("user:${membership.userId}")`));
    const [review] = reviews(store);
    assert.equal(review.status, 'unmatched');
    assert.equal(review.matched, false);
    assert.equal(review.membershipId, membership.$id);
    assert.equal(review.tenantId, 'tenant-a');
    assert.equal(review.addedBy, 'so-a');
    assert.deepEqual(Object.keys(outcome.result.body).sort(), Object.keys(result.body).sort());
  }),
);

test(
  'a co-Organizer matching IdentityFlags by email is added pending_review with no access, and the response looks exactly like a clean add',
  withEnv(async () => {
    const store = identityStore([FLAGGED_PERSON]);
    const { result, calls } = await run({
      body: add('organizer', { name: 'Someone Else', email: 'Kojo.Old@X.co' }),
      as: 'so-a',
      store,
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.setupIncomplete, false);
    assert.ok(result.body.generatedPassword);
    assert.equal(result.body.error, undefined);
    const membership = newMembership(store);
    assert.equal(membership.status, 'pending_review');
    assert.ok(!tenantReaders(store).includes(`read("user:${membership.userId}")`));
    assert.equal(calls.updateLabels, undefined);
    const [review] = reviews(store);
    assert.equal(review.status, 'open');
    assert.equal(review.matched, true);
    const [match] = JSON.parse(review.matches);
    assert.equal(match.source, 'identity_flag');
    assert.equal(match.id, 'flag-1');
    assert.deepEqual(match.fields, ['email']);
  }),
);

test(
  'an Operator matching IdentityFlags by phone (typed with spaces) at a different tenant is pending, with no operator Label (FR-23 platform-wide)',
  withEnv(async () => {
    const store = identityStore([FLAGGED_PERSON]);
    const { result, accountStore } = await run({
      body: add('operator', { name: 'K. M.', email: 'km@a.co', phone: '+233 24 123 4567' }),
      as: 'org-a',
      store,
    });

    assert.equal(result.status, 200);
    const membership = newMembership(store);
    assert.equal(membership.status, 'pending_review');
    assert.deepEqual(accountStore[membership.userId].labels, []);
    assert.deepEqual(JSON.parse(reviews(store)[0].matches)[0].fields, ['phone']);
  }),
);

test(
  'an Operator matching a previously-revoked person at the same tenant by name, ignoring case and spacing, is pending (FR-23 same-tenant)',
  withEnv(async () => {
    const store = identityStore();
    await run({
      body: add('operator', { name: '  gONE  ', email: 'gone.again@a.co' }),
      as: 'so-a',
      store,
    });

    assert.equal(newMembership(store).status, 'pending_review');
    const [match] = JSON.parse(reviews(store)[0].matches);
    assert.equal(match.source, 'same_tenant');
    assert.equal(match.id, 'm-gone-a');
    assert.equal(match.status, 'revoked');
    assert.deepEqual(match.fields, ['name']);
  }),
);

test(
  'the same-tenant check never reaches into another tenant',
  withEnv(async () => {
    const store = identityStore();
    await run({ body: add('operator', { name: 'Other Op', email: 'oo@a.co' }), as: 'so-a', store });

    assert.equal(newMembership(store).status, 'active');
    assert.deepEqual(reviews(store), []);
  }),
);

test(
  'an Operator with no match is active with its Label, and nothing is queued for Admin',
  withEnv(async () => {
    const store = identityStore([FLAGGED_PERSON]);
    const { accountStore } = await run({
      body: add('operator', { name: 'Adwoa Ofori', email: 'adwoa@a.co' }),
      as: 'so-a',
      store,
    });

    const membership = newMembership(store);
    assert.equal(membership.status, 'active');
    assert.deepEqual(accountStore[membership.userId].labels, ['operator']);
    assert.deepEqual(reviews(store), []);
  }),
);

test(
  'a co-Organizer addition runs the platform-wide check only — a same-tenant name match alone does not hold it',
  withEnv(async () => {
    const store = identityStore();
    await run({ body: add('organizer', { name: 'Gone', email: 'g2@a.co' }), as: 'so-a', store });

    assert.equal(newMembership(store).status, 'active');
    assert.equal(reviews(store)[0].status, 'unmatched');
  }),
);

test(
  "the adder's team list shows a flagged addition as pending — and nothing about why",
  withEnv(async () => {
    const store = identityStore([FLAGGED_PERSON]);
    const [, listed] = await runSteps({
      store,
      steps: [
        { body: add('operator'), as: 'so-a' },
        { body: { action: 'listTeamMembers' }, as: 'so-a' },
      ],
    });

    const row = listed.result.body.members.find((m) => m.email === 'kojo@a.co');
    assert.equal(row.status, 'pending_review');
    assert.deepEqual(Object.keys(row).sort(), [
      'email',
      'grantedAt',
      'isSelf',
      'membershipId',
      'name',
      'role',
      'status',
      'userId',
    ]);
  }),
);

test(
  'AD-2: a pending co-Organizer gets no tenant-wide Event read, while active ones keep theirs',
  withEnv(async () => {
    const store = identityStore([FLAGGED_PERSON]);
    await run({ body: add('organizer'), as: 'so-a', store });

    const pendingUid = newMembership(store).userId;
    const eventReads = store['events-1']['event-a1'].$permissions;
    assert.ok(eventReads.includes('read("user:org-a")'));
    assert.ok(!eventReads.some((p) => p.includes(pendingUid)));
  }),
);

test(
  'a failed identity lookup refuses the addition before any Account exists',
  withEnv(async () => {
    const store = identityStore();
    store['memberships-1']['m-ghost'] = {
      $id: 'm-ghost',
      userId: 'deleted-account',
      tenantId: 'tenant-a',
      role: 'operator',
      status: 'revoked',
    };
    const { result, calls } = await run({ body: add('operator'), as: 'so-a', store });

    assert.equal(result.status, 502);
    assert.equal(result.body.error, 'Failed to add team member');
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  "Admin's own additions are not screened — Admin is the reviewer",
  withEnv(async () => {
    const store = identityStore([FLAGGED_PERSON]);
    await run({ body: add('operator', { tenantId: 'tenant-a' }), as: 'admin-1', store });

    assert.equal(newMembership(store).status, 'active');
    assert.deepEqual(reviews(store), []);
  }),
);

test(
  'without the identity tables configured the addition is refused — fail closed — before any Account exists',
  withoutIdentityTables(async () => {
    const { result, calls, errors } = await run({ body: add('operator'), as: 'so-a' });

    assert.equal(result.status, 502);
    assert.equal(result.body.error, 'Failed to add team member');
    assert.equal(calls.usersCreate, undefined);
    assert.equal(calls.createRow, undefined);
    assert.ok(errors.some((e) => e.includes('tables not configured')));
  }),
);

test(
  "Admin's own additions still go through when the identity tables aren't configured",
  withoutIdentityTables(async () => {
    const { result } = await run({
      body: add('operator', { tenantId: 'tenant-a' }),
      as: 'admin-1',
    });

    assert.equal(result.status, 200);
  }),
);

test(
  'a malformed phone is refused before anything is written',
  withEnv(async () => {
    const { result, calls } = await run({
      body: add('operator', { phone: 'call me' }),
      as: 'so-a',
      store: identityStore(),
    });

    assert.equal(result.status, 400);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test('normalizeIdentity is the one comparable form Story 7.3 must write flags in', () => {
  assert.deepEqual(normalizeIdentity({ name: '  Kojo   MENSAH ', email: ' K@X.co ', phone: '' }), {
    name: 'kojo mensah',
    email: 'k@x.co',
    phone: null,
  });
  assert.equal(
    normalizeIdentity({ name: 'a', phone: '+233 (24) 123-4567' }).phone,
    '+233241234567',
  );
});
