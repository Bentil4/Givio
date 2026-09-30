import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest, isTenantIntakeComplete } from '../src/tenant-membership.js';
import { isValidPhone, normalizePhone } from '../src/shared.js';

class FakeClient {
  setEndpoint() {
    return this;
  }
  setProject() {
    return this;
  }
  setJWT() {
    return this;
  }
  setKey() {
    return this;
  }
}

const ADMIN_HEADERS = { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'dynamic-key' };
const APPLICANT_HEADERS = {
  'x-appwrite-user-jwt': 'applicant-jwt',
  'x-appwrite-key': 'dynamic-key',
};
const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });
const asApplicant = async () => ({ $id: 'applicant-1', labels: [] });

function fakeContext({ body, headers, getAccount, databases = {}, users = {}, storage = {} }) {
  const calls = {};
  const record =
    (name, impls) =>
    async (...args) => {
      calls[name] = calls[name] ?? [];
      calls[name].push(args);
      const impl = impls[name];
      return impl ? impl(...args) : undefined;
    };

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }
  class DatabasesCtor {
    getRow = record('getRow', databases);
    updateRow = record('updateRow', databases);
    createRow = record('createRow', databases);
    listRows = record('listRows', databases);
    deleteRow = record('deleteRow', databases);
  }
  class UsersCtor {
    create = record('usersCreate', users);
    delete = record('usersDelete', users);
  }
  class StorageCtor {
    getFile = record('getFile', storage);
    updateFile = record('updateFile', storage);
  }
  class MessagingCtor {
    createEmail = record('createEmail', {});
  }

  return {
    ctx: {
      req: { bodyRaw: JSON.stringify(body), headers },
      res: { json: (responseBody, status = 200) => ({ body: responseBody, status }) },
      log: () => {},
      error: () => {},
      ClientCtor: FakeClient,
      AccountCtor,
      UsersCtor,
      DatabasesCtor,
      StorageCtor,
      MessagingCtor,
    },
    calls,
  };
}

function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_EVENTS_COLLECTION_ID = 'events-1';
    process.env.APPWRITE_TENANTS_COLLECTION_ID = 'tenants-1';
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID = 'memberships-1';
    process.env.APPWRITE_TENANT_DOCUMENTS_BUCKET_ID = 'tenant-docs-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
      delete process.env.APPWRITE_TENANTS_COLLECTION_ID;
      delete process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
      delete process.env.APPWRITE_TENANT_DOCUMENTS_BUCKET_ID;
    }
  };
}

const COMPANY = {
  name: 'Asante Events',
  location: 'Kumasi',
  size: '11-50',
  type: 'funeral',
  estimatedUserCount: 12,
};

const applicationBody = (company) => ({
  action: 'submitTenantApplication',
  company,
  verificationDocumentId: 'file-1',
});

const APPLICATION_DBS = {
  listRows: async () => ({ rows: [] }),
  createRow: async ({ tableId }) => ({
    $id: tableId === 'tenants-1' ? 'tenant-new' : 'membership-new',
  }),
};
const APPLICATION_STORAGE = {
  getFile: async () => ({
    $id: 'file-1',
    mimeType: 'application/pdf',
    $permissions: ['read("user:applicant-1")', 'update("user:applicant-1")'],
  }),
  updateFile: async () => ({}),
};

function submit(company) {
  return fakeContext({
    body: applicationBody(company),
    headers: APPLICANT_HEADERS,
    getAccount: asApplicant,
    databases: APPLICATION_DBS,
    storage: APPLICATION_STORAGE,
  });
}

function invite(company) {
  return fakeContext({
    body: {
      action: 'inviteOrganizer',
      name: 'Kwame Asante',
      email: 'kwame@asante.example',
      company,
    },
    headers: ADMIN_HEADERS,
    getAccount: asAdmin,
    users: { usersCreate: async () => ({ $id: 'org-1' }) },
    databases: {
      createRow: async ({ tableId }) => ({
        $id: tableId === 'tenants-1' ? 'tenant-9' : 'membership-9',
      }),
    },
  });
}

test('isValidPhone accepts E.164 and rejects anything else', () => {
  assert.equal(isValidPhone('+233241234567'), true);
  for (const phone of [
    '0241234567',
    '+0241234567',
    '+233 24 123 4567',
    '+12345',
    '+1234567890123456',
  ]) {
    assert.equal(isValidPhone(phone), false, phone);
  }
});

test('normalizePhone strips spaces, dashes and parentheses only', () => {
  assert.equal(normalizePhone(' +233 (24) 123-4567 '), '+233241234567');
  assert.equal(normalizePhone('+233.24.123'), '+233.24.123');
});

test(
  'submitTenantApplication rejects an application without a contact phone with 400',
  withEnv(async () => {
    for (const contactPhone of [undefined, null, '']) {
      const { ctx, calls } = submit({ ...COMPANY, contactPhone });
      const result = await handleTenantMembershipRequest(ctx);
      assert.equal(result.status, 400);
      assert.match(result.body.error, /contactPhone/);
      assert.equal(calls.createRow, undefined);
    }
  }),
);

test(
  'submitTenantApplication rejects an invalid contact phone with 400',
  withEnv(async () => {
    for (const contactPhone of [
      '0241234567',
      '+233',
      'call me',
      '   ',
      233241234567,
      ['+233241234567'],
    ]) {
      const { ctx, calls } = submit({ ...COMPANY, contactPhone });
      const result = await handleTenantMembershipRequest(ctx);
      assert.equal(result.status, 400, String(contactPhone));
      assert.equal(calls.createRow, undefined);
    }
  }),
);

test(
  'submitTenantApplication stores the normalized contact phone on the pending Tenant',
  withEnv(async () => {
    const { ctx, calls } = submit({ ...COMPANY, contactPhone: '+233 (24) 123-4567' });
    const result = await handleTenantMembershipRequest(ctx);
    assert.equal(result.status, 200);
    const [[tenantArgs]] = calls.createRow;
    assert.equal(tenantArgs.tableId, 'tenants-1');
    assert.equal(tenantArgs.data.contactPhone, '+233241234567');
    assert.equal(tenantArgs.data.status, 'pending');
  }),
);

test(
  'submitTenantApplication still refuses server-owned fields alongside a valid contact phone',
  withEnv(async () => {
    const { ctx, calls } = submit({
      ...COMPANY,
      contactPhone: '+233241234567',
      status: 'approved',
    });
    const result = await handleTenantMembershipRequest(ctx);
    assert.equal(result.status, 400);
    assert.match(result.body.error, /status/);
    assert.equal(calls.createRow, undefined);
  }),
);

test(
  'inviteOrganizer stores the normalized contact phone when one is given',
  withEnv(async () => {
    const { ctx, calls } = invite({ ...COMPANY, contactPhone: '+233 24-123-4567' });
    const result = await handleTenantMembershipRequest(ctx);
    assert.equal(result.status, 200);
    assert.equal(calls.createRow[0][0].data.contactPhone, '+233241234567');
  }),
);

test(
  'inviteOrganizer works without a contact phone and writes no contactPhone column',
  withEnv(async () => {
    for (const company of [COMPANY, { ...COMPANY, contactPhone: '' }]) {
      const { ctx, calls } = invite(company);
      const result = await handleTenantMembershipRequest(ctx);
      assert.equal(result.status, 200);
      assert.ok(!('contactPhone' in calls.createRow[0][0].data));
    }
  }),
);

test(
  'inviteOrganizer rejects an invalid contact phone with 400 before creating the Account',
  withEnv(async () => {
    const { ctx, calls } = invite({ ...COMPANY, contactPhone: '024 123 4567' });
    const result = await handleTenantMembershipRequest(ctx);
    assert.equal(result.status, 400);
    assert.equal(calls.usersCreate, undefined);
    assert.equal(calls.createRow, undefined);
  }),
);

const legacyPendingTenant = (overrides = {}) => ({
  $id: 't1',
  status: 'pending',
  ...COMPANY,
  verificationDocumentId: 'file-1',
  ...overrides,
});

test('an application submitted before contactPhone existed still counts as a complete intake', () => {
  assert.equal(isTenantIntakeComplete(legacyPendingTenant()), true);
});

test(
  'recordTenantVerification and approval still work for a Tenant with no contactPhone',
  withEnv(async () => {
    const verify = fakeContext({
      body: {
        action: 'recordTenantVerification',
        tenantId: 't1',
        documentReviewed: true,
        phoneVerified: true,
      },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: { getRow: async () => legacyPendingTenant(), updateRow: async () => ({}) },
      storage: { getFile: async () => ({ $id: 'file-1' }) },
    });
    assert.equal((await handleTenantMembershipRequest(verify.ctx)).status, 200);

    const approve = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'approved' },
      headers: ADMIN_HEADERS,
      getAccount: asAdmin,
      databases: {
        getRow: async () =>
          legacyPendingTenant({ verifiedBy: 'admin-1', verifiedAt: '2026-09-30T10:00:00.000Z' }),
        listRows: async () => ({ rows: [], total: 0 }),
        updateRow: async () => ({}),
      },
    });
    const result = await handleTenantMembershipRequest(approve.ctx);
    assert.equal(result.status, 200);
    assert.deepEqual(approve.calls.updateRow[0][0].data, { status: 'approved' });
  }),
);
