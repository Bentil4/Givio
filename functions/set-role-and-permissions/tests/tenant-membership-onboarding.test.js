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
  COMPANY,
  applicationBody,
  APPLICANT_FILE,
  APPLICATION_HAPPY_DBS,
  APPLICATION_HAPPY_STORAGE,
  inviteBody,
} from './helpers/tenant-membership-fixtures.js';

test(
  'submitTenantApplication rejects an unauthenticated caller with 401',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({ body: applicationBody(), getAccount: asApplicant });
    const result = await handleTenantMembershipRequest(ctx);
    assert.equal(result.status, 401);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'submitTenantApplication creates a pending Tenant and an active super_organizer Membership for the caller',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: applicationBody(),
      headers: APPLICANT_HEADERS,
      getAccount: asApplicant,
      databases: APPLICATION_HAPPY_DBS,
      storage: APPLICATION_HAPPY_STORAGE,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.tenantStatus, 'pending');
    const [[tenantArgs], [membershipArgs]] = calls.createRow;
    assert.equal(tenantArgs.tableId, 'tenants-1');
    assert.equal(tenantArgs.data.status, 'pending');
    assert.equal(tenantArgs.data.superOrganizerId, 'applicant-1');
    assert.equal(tenantArgs.data.verificationDocumentId, 'file-1');
    assert.equal(tenantArgs.data.verifiedBy, undefined);
    assert.deepEqual(tenantArgs.permissions, ['read("label:admin")', 'read("user:applicant-1")']);
    assert.equal(membershipArgs.tableId, 'memberships-1');
    assert.equal(membershipArgs.data.userId, 'applicant-1');
    assert.equal(membershipArgs.data.tenantId, 'tenant-new');
    assert.equal(membershipArgs.data.role, 'super_organizer');
    assert.equal(membershipArgs.data.status, 'active');
    const [[lockArgs]] = calls.updateFile;
    assert.deepEqual(lockArgs.permissions, ['read("label:admin")', 'read("user:applicant-1")']);
  }),
);

test(
  'submitTenantApplication refuses a caller who already holds any Membership (one Account per relationship)',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: applicationBody(),
      headers: APPLICANT_HEADERS,
      getAccount: asApplicant,
      databases: {
        ...APPLICATION_HAPPY_DBS,
        listRows: async () => ({
          rows: [{ $id: 'm-old', userId: 'applicant-1', status: 'revoked' }],
        }),
      },
      storage: APPLICATION_HAPPY_STORAGE,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(result.body.error, "We couldn't process this application");
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'submitTenantApplication refuses a caller who already holds a platform Label (Admin/Operator)',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: applicationBody(),
      headers: APPLICANT_HEADERS,
      getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
      databases: APPLICATION_HAPPY_DBS,
      storage: APPLICATION_HAPPY_STORAGE,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.createRow, undefined);
  }),
);

for (const smuggled of [{ status: 'approved' }, { role: 'operator' }, { superOrganizerId: 'x' }]) {
  test(
    `submitTenantApplication refuses client-supplied ${Object.keys(smuggled)[0]} (top-level and inside company)`,
    withEnv(async () => {
      for (const body of [
        applicationBody(smuggled),
        applicationBody({ company: { ...COMPANY, ...smuggled } }),
      ]) {
        const { ctx, calls } = fakeContext({
          body,
          headers: APPLICANT_HEADERS,
          getAccount: asApplicant,
          databases: APPLICATION_HAPPY_DBS,
          storage: APPLICATION_HAPPY_STORAGE,
        });
        const result = await handleTenantMembershipRequest(ctx);
        assert.equal(result.status, 400);
        assert.equal(calls.createRow, undefined);
      }
    }),
  );
}

test(
  'submitTenantApplication rejects an incomplete intake with 400 before any write',
  withEnv(async () => {
    const { estimatedUserCount: _omit, ...withoutCount } = COMPANY;
    for (const body of [
      applicationBody({ company: withoutCount }),
      applicationBody({ company: { ...COMPANY, location: '   ' } }),
      applicationBody({ company: { ...COMPANY, size: 'huge' } }),
      applicationBody({ verificationDocumentId: '' }),
      applicationBody({ company: 'not-an-object' }),
    ]) {
      const { ctx, calls } = fakeContext({
        body,
        headers: APPLICANT_HEADERS,
        getAccount: asApplicant,
        databases: APPLICATION_HAPPY_DBS,
        storage: APPLICATION_HAPPY_STORAGE,
      });
      const result = await handleTenantMembershipRequest(ctx);
      assert.equal(result.status, 400);
      assert.equal(calls.createRow, undefined);
    }
  }),
);

test(
  'submitTenantApplication refuses a document the caller did not upload',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: applicationBody(),
      headers: APPLICANT_HEADERS,
      getAccount: asApplicant,
      databases: APPLICATION_HAPPY_DBS,
      storage: {
        getFile: async () => ({ ...APPLICANT_FILE, $permissions: ['update("user:someone-else")'] }),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 400);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'submitTenantApplication rolls back the Tenant when the Membership write fails',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: applicationBody(),
      headers: APPLICANT_HEADERS,
      getAccount: asApplicant,
      databases: {
        ...APPLICATION_HAPPY_DBS,
        createRow: async ({ tableId }) => {
          if (tableId === 'tenants-1') return { $id: 'tenant-new' };
          throw new Error('boom');
        },
      },
      storage: APPLICATION_HAPPY_STORAGE,
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 502);
    assert.deepEqual(calls.deleteRow[0][0], {
      databaseId: 'db-1',
      tableId: 'tenants-1',
      rowId: 'tenant-new',
    });
    assert.equal(calls.updateFile, undefined);
  }),
);

test(
  'inviteOrganizer rejects a non-admin caller with 403',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({ body: inviteBody(), ...asOperator });
    const result = await handleTenantMembershipRequest(ctx);
    assert.equal(result.status, 403);
    assert.equal(calls.usersCreate, undefined);
  }),
);

test(
  'inviteOrganizer creates an approved Tenant (verified by the Admin) and an active super_organizer Membership, then emails the invite',
  withEnv(async () => {
    const { ctx, calls, logs } = fakeContext({
      body: inviteBody(),
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: { usersCreate: async () => ({ $id: 'org-1' }) },
      databases: {
        createRow: async ({ tableId }) => ({
          $id: tableId === 'tenants-1' ? 'tenant-9' : 'membership-9',
        }),
      },
      messaging: { createEmail: async () => ({}) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.tenantStatus, 'approved');
    assert.deepEqual(result.body.inviteStatus, { email: 'sent' });
    const [[tenantArgs], [membershipArgs]] = calls.createRow;
    assert.equal(tenantArgs.data.status, 'approved');
    assert.equal(tenantArgs.data.superOrganizerId, 'org-1');
    assert.equal(tenantArgs.data.verifiedBy, 'admin-1');
    assert.ok(tenantArgs.data.verifiedAt);
    assert.equal(membershipArgs.data.userId, 'org-1');
    assert.equal(membershipArgs.data.tenantId, 'tenant-9');
    assert.equal(membershipArgs.data.role, 'super_organizer');
    assert.equal(membershipArgs.data.status, 'active');
    assert.deepEqual(calls.createEmail[0][0].users, ['org-1']);
    assert.ok(!logs.join('\n').includes(result.body.generatedPassword));
  }),
);

test(
  'inviteOrganizer returns 409 without writing anything when the email already has an Account',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: inviteBody(),
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: {
        usersCreate: async () => Promise.reject(Object.assign(new Error('dup'), { code: 409 })),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'inviteOrganizer deletes the new Account when the Tenant write fails',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: inviteBody(),
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: { usersCreate: async () => ({ $id: 'org-1' }) },
      databases: { createRow: async () => Promise.reject(new Error('boom')) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 502);
    assert.deepEqual(calls.usersDelete[0][0], { userId: 'org-1' });
    assert.equal(calls.createEmail, undefined);
  }),
);

test(
  'inviteOrganizer deletes the Tenant and the Account when the Membership write fails',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: inviteBody(),
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      users: { usersCreate: async () => ({ $id: 'org-1' }) },
      databases: {
        createRow: async ({ tableId }) => {
          if (tableId === 'tenants-1') return { $id: 'tenant-9' };
          throw new Error('boom');
        },
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 502);
    assert.equal(calls.deleteRow[0][0].rowId, 'tenant-9');
    assert.deepEqual(calls.usersDelete[0][0], { userId: 'org-1' });
    assert.equal(calls.createEmail, undefined);
  }),
);
