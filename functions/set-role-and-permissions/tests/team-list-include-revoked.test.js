import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withEnv, run } from './helpers/team-management-fixtures.js';

// FR-13: a company's donation views still name a recorder after their access was revoked.

const listTeam = (extra = {}) => ({ action: 'listTeamMembers', ...extra });

const userIds = (result) => result.body.members.map((m) => m.userId).sort();

test(
  'includeRevoked adds the tenant’s revoked members, with their status',
  withEnv(async () => {
    const { result } = await run({ body: listTeam({ includeRevoked: true }), as: 'org-a' });

    assert.equal(result.status, 200);
    assert.deepEqual(userIds(result), ['gone-a', 'op-a', 'org-a', 'so-a']);
    const gone = result.body.members.find((m) => m.userId === 'gone-a');
    assert.equal(gone.name, 'Gone');
    assert.equal(gone.status, 'revoked');
  }),
);

test(
  'without includeRevoked the listing is unchanged: active members only',
  withEnv(async () => {
    const omitted = await run({ body: listTeam(), as: 'so-a' });
    const declined = await run({ body: listTeam({ includeRevoked: false }), as: 'so-a' });

    assert.deepEqual(userIds(omitted.result), ['op-a', 'org-a', 'so-a']);
    assert.deepEqual(userIds(declined.result), ['op-a', 'org-a', 'so-a']);
  }),
);

test(
  'includeRevoked must be a boolean',
  withEnv(async () => {
    const { result } = await run({ body: listTeam({ includeRevoked: 'yes' }), as: 'so-a' });

    assert.equal(result.status, 400);
  }),
);

test(
  'includeRevoked is an Organizer-tier option: Admin is refused',
  withEnv(async () => {
    const { result } = await run({
      body: listTeam({ tenantId: 'tenant-a', includeRevoked: true }),
      as: 'admin-1',
    });

    assert.equal(result.status, 400);
  }),
);

test(
  'an Operator cannot list the team, revoked members or not',
  withEnv(async () => {
    const { result } = await run({ body: listTeam({ includeRevoked: true }), as: 'op-a' });

    assert.equal(result.status, 403);
  }),
);
