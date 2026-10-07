import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleEventAssignmentRequest } from '../src/event-assignment.js';
import { handleFamilyAccessRequest } from '../src/family-access.js';
import { fakeContext, withEnv, auditRows } from './helpers/tenant-events-fixtures.js';

async function assign({ as, eventId = 'event-a1', assignedUserIds, store }) {
  const body = { action: 'assignOperators', eventId, assignedUserIds };
  const context = fakeContext({ body, as, store });
  const result = await handleEventAssignmentRequest(context.ctx);
  return { result, ...context };
}

async function generateCode({ as, eventId = 'event-a1' }) {
  const context = fakeContext({ body: { action: 'generateAccessCode', eventId }, as });
  const result = await handleFamilyAccessRequest(context.ctx);
  return { result, ...context };
}

test(
  'an Organizer assigns their own Operator, who gains read access',
  withEnv(async () => {
    const { result, store } = await assign({ as: 'org-a', assignedUserIds: ['op-a'] });

    assert.equal(result.status, 200);
    const row = store['events-1']['event-a1'];
    assert.deepEqual(row.assignedUserIds, ['op-a']);
    assert.ok(row.$permissions.includes('read("user:op-a")'));
    assert.ok(row.$permissions.includes('read("user:so-a")'));
  }),
);

test(
  'the assignment is audit-logged with before and after',
  withEnv(async () => {
    const { store } = await assign({ as: 'so-a', assignedUserIds: ['op-a'] });

    const [entry] = auditRows(store);
    assert.equal(entry.action, 'edit');
    assert.equal(entry.performedBy, 'so-a');
    assert.deepEqual(entry.previousValues, { assignedUserIds: [] });
    assert.deepEqual(entry.newValues.assignedUserIds, ['op-a']);
  }),
);

for (const [label, userId] of [
  ["another tenant's Operator", 'op-b'],
  ['a revoked Operator', 'gone-a'],
  ['a co-Organizer', 'org-a'],
]) {
  test(
    `${label} cannot be assigned`,
    withEnv(async () => {
      const { result, calls } = await assign({ as: 'so-a', assignedUserIds: [userId] });

      assert.equal(result.status, 400);
      assert.equal(calls.updateRow, undefined);
    }),
  );
}

for (const eventId of ['event-b1', 'event-admin']) {
  test(
    `assigning on ${eventId} (not theirs) answers 404`,
    withEnv(async () => {
      const { result, calls } = await assign({ as: 'so-a', eventId, assignedUserIds: [] });

      assert.deepEqual(result, { status: 404, body: { error: 'Event not found' } });
      assert.equal(calls.updateRow, undefined);
    }),
  );
}

test(
  "a pending tenant's Organizer cannot assign",
  withEnv(async () => {
    const { result } = await assign({ as: 'so-p', assignedUserIds: [] });

    assert.equal(result.status, 403);
  }),
);

for (const as of ['admin-1', 'superadmin-1']) {
  for (const eventId of ['event-a1', 'event-admin']) {
    test(
      `AD-12 amended: ${as} can neither assign Operators nor generate a code on ${eventId}`,
      withEnv(async () => {
        const assigned = await assign({ as, eventId, assignedUserIds: ['op-a'] });
        const generated = await generateCode({ as, eventId });

        assert.equal(assigned.result.status, 403);
        assert.equal(generated.result.status, 403);
        assert.equal(assigned.calls.updateRow, undefined);
        assert.equal(generated.calls.updateRow, undefined);
      }),
    );
  }
}

test(
  'an Organizer generates a family code for their own Event',
  withEnv(async () => {
    const { result, store } = await generateCode({ as: 'org-a' });

    assert.equal(result.status, 200);
    assert.equal(result.body.accessCode.length, 8);
    assert.equal(store['events-1']['event-a1'].accessCode, result.body.accessCode);
  }),
);

for (const eventId of ['event-b1', 'event-admin', 'missing']) {
  test(
    `generating a code for ${eventId} answers 404 and writes nothing`,
    withEnv(async () => {
      const { result, calls } = await generateCode({ as: 'so-a', eventId });

      assert.deepEqual(result, { status: 404, body: { error: 'Event not found' } });
      assert.equal(calls.updateRow, undefined);
    }),
  );
}

test(
  "a suspended tenant's Organizer cannot generate a code",
  withEnv(async () => {
    const { result, calls } = await generateCode({ as: 'so-s' });

    assert.equal(result.status, 403);
    assert.equal(calls.updateRow, undefined);
  }),
);
