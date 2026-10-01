import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withEnv, add, run } from './helpers/team-management-fixtures.js';
import {
  FLAGS,
  FLAGGED_PERSON,
  identityStore,
  reviews,
  membershipOf,
  runSteps,
  resolve,
  renameAddedAccount,
} from './helpers/identity-check-fixtures.js';

// Story 7.2: Admin's side of a screened addition — the queue, and confirm/clear/acknowledge.

const LIST = { action: 'listIdentityReviews' };
const LIST_TEAM = { action: 'listTeamMembers' };

async function flaggedAddition(role, as = 'so-a') {
  const store = identityStore([FLAGGED_PERSON]);
  const [added] = await runSteps({ store, steps: [{ body: add(role), as }] });
  return { store, accounts: added.accountStore, review: reviews(store)[0] };
}

function teamRow(outcome, email = 'kojo@a.co') {
  return outcome.result.body.members.find((m) => m.email === email);
}

test(
  'only Admin can read or resolve the queue',
  withEnv(async () => {
    const { store, review } = await flaggedAddition('operator');
    for (const body of [LIST, resolve(review.$id, 'clear')]) {
      const { result } = await run({ body, as: 'so-a', store });
      assert.equal(result.status, 403);
    }
    assert.equal(review.status, 'open');
  }),
);

test(
  'the queue lists flagged and not-yet-seen co-Organizer additions, with what matched',
  withEnv(async () => {
    const { store, accounts } = await flaggedAddition('organizer');
    const [, listed] = await runSteps({
      store,
      accounts,
      steps: [
        { body: add('organizer', { name: 'Esi Arthur', email: 'esi@a.co' }), as: 'so-a' },
        { body: LIST, as: 'admin-1' },
      ],
    });

    const queue = listed.result.body.reviews;
    assert.deepEqual(queue.map((r) => r.status).sort(), ['open', 'unmatched']);
    const flagged = queue.find((r) => r.status === 'open');
    assert.equal(flagged.name, 'Kojo Mensah');
    assert.equal(flagged.matches[0].reason, FLAGGED_PERSON.reason);
  }),
);

test(
  "clearing a false positive activates the Operator with its Label — the adder's next view shows them active",
  withEnv(async () => {
    const { store, accounts, review } = await flaggedAddition('operator');
    const [cleared, team] = await runSteps({
      store,
      accounts,
      steps: [
        { body: resolve(review.$id, 'clear'), as: 'admin-1' },
        { body: LIST_TEAM, as: 'so-a' },
      ],
    });

    assert.equal(cleared.result.status, 200);
    assert.equal(teamRow(team).status, 'active');
    assert.deepEqual(cleared.accountStore[review.userId].labels, ['operator']);
    assert.equal(review.status, 'cleared');
    assert.equal(review.reviewedBy, 'admin-1');
  }),
);

test(
  'clearing a co-Organizer grants the Tenant row and tenant-wide Event read through the ordinary paths',
  withEnv(async () => {
    const { store, accounts, review } = await flaggedAddition('organizer');
    await runSteps({
      store,
      accounts,
      steps: [{ body: resolve(review.$id, 'clear'), as: 'admin-1' }],
    });

    const grant = `read("user:${review.userId}")`;
    assert.ok(store['tenants-1']['tenant-a'].$permissions.includes(grant));
    assert.ok(store['events-1']['event-a1'].$permissions.includes(grant));
  }),
);

test(
  "confirming a real match revokes the Membership — gone from the adder's next view — without writing IdentityFlags (Story 7.3 owns that)",
  withEnv(async () => {
    const { store, accounts, review } = await flaggedAddition('operator');
    const [confirmed, team] = await runSteps({
      store,
      accounts,
      steps: [
        { body: resolve(review.$id, 'confirm'), as: 'admin-1' },
        { body: LIST_TEAM, as: 'so-a' },
      ],
    });

    assert.equal(confirmed.result.status, 200);
    assert.equal(teamRow(team), undefined);
    assert.equal(membershipOf(store, review.userId).status, 'revoked');
    assert.equal(review.status, 'confirmed');
    assert.deepEqual(Object.keys(store[FLAGS]), ['flag-1']);
  }),
);

test(
  'a clearance at one tenant is never reused: the same identity added at another tenant is held for its own review',
  withEnv(async () => {
    const { store, accounts, review } = await flaggedAddition('operator');
    const [cleared] = await runSteps({
      store,
      accounts,
      steps: [{ body: resolve(review.$id, 'clear'), as: 'admin-1' }],
    });
    const renamed = renameAddedAccount({ store, accounts: cleared.accountStore, userId: 'kojo-a' });
    await runSteps({
      store,
      accounts: renamed,
      steps: [{ body: add('operator', { email: 'kojo@b.co' }), as: 'so-b' }],
    });

    const atB = reviews(store).find((r) => r.tenantId === 'tenant-b');
    assert.equal(atB.status, 'open');
    assert.equal(membershipOf(store, 'new-1').status, 'pending_review');
    assert.equal(membershipOf(store, 'kojo-a').status, 'active');
  }),
);

test(
  'a co-Organizer addition with no match is acknowledged, not confirmed or cleared',
  withEnv(async () => {
    const store = identityStore();
    await run({ body: add('organizer'), as: 'so-a', store });
    const [review] = reviews(store);

    const { result: wrong } = await run({
      body: resolve(review.$id, 'clear'),
      as: 'admin-1',
      store,
    });
    assert.equal(wrong.status, 409);
    const { result } = await run({
      body: resolve(review.$id, 'acknowledge'),
      as: 'admin-1',
      store,
    });
    assert.equal(result.status, 200);
    assert.equal(review.status, 'acknowledged');
    assert.equal(membershipOf(store, review.userId).status, 'active');
  }),
);

test(
  'a resolved review cannot be decided again',
  withEnv(async () => {
    const { store, accounts, review } = await flaggedAddition('operator');
    const [, again] = await runSteps({
      store,
      accounts,
      steps: [
        { body: resolve(review.$id, 'confirm'), as: 'admin-1' },
        { body: resolve(review.$id, 'clear'), as: 'admin-1' },
      ],
    });

    assert.equal(again.result.status, 409);
    assert.equal(membershipOf(store, review.userId).status, 'revoked');
  }),
);

test(
  'clearing a pending member the adder already revoked never brings them back',
  withEnv(async () => {
    const { store, accounts, review } = await flaggedAddition('operator');
    await runSteps({
      store,
      accounts,
      steps: [
        { body: { action: 'revokeMembership', membershipId: review.membershipId }, as: 'so-a' },
        { body: resolve(review.$id, 'clear'), as: 'admin-1' },
      ],
    });

    assert.equal(membershipOf(store, review.userId).status, 'revoked');
    assert.equal(review.status, 'cleared');
  }),
);

test(
  'an unknown review is 404 and an unknown decision is 400',
  withEnv(async () => {
    const store = identityStore();
    const { result: missing } = await run({ body: resolve('nope', 'clear'), as: 'admin-1', store });
    const { result: bad } = await run({ body: resolve('nope', 'ban'), as: 'admin-1', store });

    assert.equal(missing.status, 404);
    assert.equal(bad.status, 400);
  }),
);
