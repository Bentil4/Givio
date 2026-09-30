import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';
import {
  fakeContext,
  ADMIN_HEADERS,
  asAdmin,
  asOperator,
  withEnv,
  APPLICANT_HEADERS,
  asApplicant,
  inviteBody,
} from './helpers/tenant-membership-fixtures.js';

test(
  'rejects a verified non-admin caller with 403',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'createMembership', userId: 'u1', tenantId: 't1', role: 'operator' },
      ...asOperator,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 403);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'rejects an unknown action with 400',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: { action: 'notARealAction' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 400);
  }),
);

test(
  'a pending applicant (no Label) is refused every Admin-gated tenant action with 403',
  withEnv(async () => {
    // addTeamMember is Organizer-callable since Story 7.1 — see team-management.test.js.
    for (const body of [
      { action: 'createMembership', userId: 'u2', tenantId: 't1', role: 'operator' },
      { action: 'setTenantStatus', tenantId: 't1', status: 'approved' },
      inviteBody(),
    ]) {
      const { ctx, calls } = fakeContext({
        body,
        headers: APPLICANT_HEADERS,
        getAccount: asApplicant,
      });
      const result = await handleTenantMembershipRequest(ctx);
      assert.equal(result.status, 403);
      assert.equal(calls.createRow, undefined);
      assert.equal(calls.updateRow, undefined);
    }
  }),
);

test(
  'email validation rejects a dot-heavy domain in linear time on both email actions (js/polynomial-redos)',
  withEnv(async () => {
    const attack = '!@!.' + '!.'.repeat(40_000) + ' ';
    for (const body of [
      { action: 'addTeamMember', name: 'X', email: attack, tenantId: 't1', role: 'operator' },
      inviteBody({ email: attack }),
    ]) {
      const { ctx, calls } = fakeContext({ body, headers: ADMIN_HEADERS, getAccount: asAdmin });
      const started = process.hrtime.bigint();
      const result = await handleTenantMembershipRequest(ctx);
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

      assert.equal(result.status, 400);
      assert.ok(elapsedMs < 200, `validation took ${elapsedMs.toFixed(1)} ms`);
      assert.equal(calls.createRow, undefined);
    }
  }),
);

test(
  'email validation enforces the RFC 5321 254-character maximum',
  withEnv(async () => {
    const domain = '@example.com';
    const atLimit = 'a'.repeat(254 - domain.length) + domain;
    const overLimit = 'a' + atLimit;
    assert.equal(atLimit.length, 254);

    const over = fakeContext({
      body: inviteBody({ email: overLimit }),
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
    });
    assert.equal((await handleTenantMembershipRequest(over.ctx)).status, 400);

    const overTeam = fakeContext({
      body: {
        action: 'addTeamMember',
        name: 'X',
        email: overLimit,
        tenantId: 't1',
        role: 'operator',
      },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
    });
    assert.equal((await handleTenantMembershipRequest(overTeam.ctx)).status, 400);
  }),
);

test(
  'email validation still accepts ordinary addresses and rejects malformed ones',
  withEnv(async () => {
    const statusFor = async (email) => {
      const { ctx } = fakeContext({
        body: { action: 'addTeamMember', name: 'X', email, tenantId: 't1', role: 'bogus-role' },
        headers: ADMIN_HEADERS,
        getAccount: asAdmin,
      });
      const result = await handleTenantMembershipRequest(ctx);
      return result.body.error;
    };
    // An invalid role is checked after the email, so a valid email surfaces the role error instead.
    for (const ok of ['a@b.co', 'first.last@sub.example.com', 'x+tag@gmail.com']) {
      assert.match(await statusFor(ok), /role must be one of/, ok);
    }
    for (const bad of ['a@b', 'a@b.', 'a@.b', 'a@b..co', 'a b@c.co', '@b.co', 'a@b@c.co']) {
      assert.equal(await statusFor(bad), 'email must be a valid email address', bad);
    }
  }),
);
