import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTenantMembershipRequest } from '../src/tenant-membership.js';

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

function fakeContext({
  body,
  headers = ADMIN_HEADERS,
  getAccount = asAdmin,
  databases = {},
  storage = {},
}) {
  const calls = {};
  const errors = [];

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

  class StorageCtor {
    getFile = record('getFile', storage);
    updateFile = record('updateFile', storage);
  }

  class UsersCtor {}
  class MessagingCtor {}

  const res = {
    json(responseBody, status = 200) {
      return { body: responseBody, status };
    },
  };

  return {
    ctx: {
      req: { bodyRaw: JSON.stringify(body), headers },
      res,
      log: () => {},
      error: (msg) => errors.push(msg),
      ClientCtor: FakeClient,
      AccountCtor,
      UsersCtor,
      DatabasesCtor,
      StorageCtor,
      MessagingCtor,
    },
    calls,
    errors,
  };
}

const ADMIN_HEADERS = { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'dynamic-key' };
const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });

const COMPANY = {
  name: 'Asante Events',
  location: 'Kumasi',
  size: '11-50',
  type: 'funeral',
  estimatedUserCount: 12,
};

const pendingTenant = (overrides = {}) => ({
  $id: 't1',
  status: 'pending',
  ...COMPANY,
  verificationDocumentId: 'file-1',
  ...overrides,
});

const verifyBody = (overrides = {}) => ({
  action: 'recordTenantVerification',
  tenantId: 't1',
  documentReviewed: true,
  phoneVerified: true,
  ...overrides,
});

function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_EVENTS_COLLECTION_ID = 'events-1';
    process.env.APPWRITE_DONATIONS_COLLECTION_ID = 'donations-1';
    process.env.APPWRITE_TENANTS_COLLECTION_ID = 'tenants-1';
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID = 'memberships-1';
    process.env.APPWRITE_TENANT_DOCUMENTS_BUCKET_ID = 'tenant-docs-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
      delete process.env.APPWRITE_DONATIONS_COLLECTION_ID;
      delete process.env.APPWRITE_TENANTS_COLLECTION_ID;
      delete process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
      delete process.env.APPWRITE_TENANT_DOCUMENTS_BUCKET_ID;
    }
  };
}

test(
  'recordTenantVerification rejects a non-admin caller with 403',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: verifyBody(),
      headers: { 'x-appwrite-user-jwt': 'applicant-jwt', 'x-appwrite-key': 'dynamic-key' },
      getAccount: async () => ({ $id: 'applicant-1', labels: [] }),
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 403);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'recordTenantVerification refuses unless both checks are confirmed',
  withEnv(async () => {
    for (const overrides of [
      { documentReviewed: false },
      { phoneVerified: false },
      { documentReviewed: 'true' },
      { phoneVerified: undefined },
    ]) {
      const { ctx, calls } = fakeContext({
        body: verifyBody(overrides),
        databases: { getRow: async () => pendingTenant() },
      });

      const result = await handleTenantMembershipRequest(ctx);

      assert.equal(result.status, 400);
      assert.equal(calls.getRow, undefined);
      assert.equal(calls.updateRow, undefined);
    }
  }),
);

test(
  'recordTenantVerification stamps verifiedBy with the calling Admin and verifiedAt with now',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: verifyBody(),
      databases: { getRow: async () => pendingTenant(), updateRow: async () => ({}) },
      storage: { getFile: async () => ({ $id: 'file-1' }) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.deepEqual(calls.getFile[0][0], { bucketId: 'tenant-docs-1', fileId: 'file-1' });
    const update = calls.updateRow[0][0];
    assert.equal(update.rowId, 't1');
    assert.deepEqual(Object.keys(update.data).sort(), ['verifiedAt', 'verifiedBy']);
    assert.equal(update.data.verifiedBy, 'admin-1');
    assert.ok(!Number.isNaN(Date.parse(update.data.verifiedAt)));
    assert.equal(result.body.verifiedBy, 'admin-1');
    assert.equal(result.body.verifiedAt, update.data.verifiedAt);
  }),
);

test(
  'recordTenantVerification keeps the first verifier on a repeat call',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: verifyBody(),
      databases: {
        getRow: async () =>
          pendingTenant({ verifiedBy: 'admin-0', verifiedAt: '2026-09-29T09:00:00.000Z' }),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(result.body.verifiedBy, 'admin-0');
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'recordTenantVerification refuses a Tenant that is no longer pending',
  withEnv(async () => {
    for (const status of ['approved', 'rejected', 'suspended']) {
      const { ctx, calls } = fakeContext({
        body: verifyBody(),
        databases: { getRow: async () => pendingTenant({ status }) },
      });

      const result = await handleTenantMembershipRequest(ctx);

      assert.equal(result.status, 409);
      assert.equal(calls.updateRow, undefined);
    }
  }),
);

test(
  'recordTenantVerification refuses an incomplete intake',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: verifyBody(),
      databases: { getRow: async () => pendingTenant({ verificationDocumentId: undefined }) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.getFile, undefined);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'recordTenantVerification refuses when the verification document no longer exists',
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: verifyBody(),
      databases: { getRow: async () => pendingTenant() },
      storage: {
        getFile: async () => {
          throw new Error('File not found');
        },
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'The verification document could not be found');
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'recordTenantVerification returns 404 for an unknown Tenant',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: verifyBody(),
      databases: {
        getRow: async () => {
          throw new Error('Row not found');
        },
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 404);
  }),
);

test(
  'recordTenantVerification returns 502 when the write fails',
  withEnv(async () => {
    const { ctx } = fakeContext({
      body: verifyBody(),
      databases: {
        getRow: async () => pendingTenant(),
        updateRow: async () => {
          throw new Error('boom');
        },
      },
      storage: { getFile: async () => ({ $id: 'file-1' }) },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 502);
  }),
);

test(
  'recordTenantVerification fails with 500 when the documents bucket is not configured',
  withEnv(async () => {
    delete process.env.APPWRITE_TENANT_DOCUMENTS_BUCKET_ID;
    const { ctx, calls } = fakeContext({ body: verifyBody() });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 500);
    assert.equal(calls.getRow, undefined);
  }),
);

test(
  "setTenantStatus('approved') refuses a complete intake whose verification was never recorded",
  withEnv(async () => {
    for (const overrides of [
      {},
      { verifiedBy: 'admin-1' },
      { verifiedAt: '2026-09-30T10:00:00.000Z' },
    ]) {
      const { ctx, calls } = fakeContext({
        body: { action: 'setTenantStatus', tenantId: 't1', status: 'approved' },
        databases: { getRow: async () => pendingTenant(overrides) },
      });

      const result = await handleTenantMembershipRequest(ctx);

      assert.equal(result.status, 409);
      assert.equal(calls.updateRow, undefined);
    }
  }),
);

test(
  "setTenantStatus('approved') still refuses an incomplete intake even when verification is recorded",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'approved' },
      databases: {
        getRow: async () =>
          pendingTenant({
            verificationDocumentId: undefined,
            verifiedBy: 'admin-1',
            verifiedAt: '2026-09-30T10:00:00.000Z',
          }),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 409);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  "setTenantStatus('approved') approves once verification is recorded, without touching any Membership",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'approved' },
      databases: {
        getRow: async () =>
          pendingTenant({ verifiedBy: 'admin-1', verifiedAt: '2026-09-30T10:00:00.000Z' }),
        listRows: async () => ({ rows: [], total: 0 }),
        updateRow: async () => ({}),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.equal(calls.updateRow[0][0].tableId, 'tenants-1');
    assert.deepEqual(calls.updateRow[0][0].data, { status: 'approved' });
    assert.ok(calls.updateRow.every(([args]) => args.tableId !== 'memberships-1'));
  }),
);

test(
  "setTenantStatus('rejected') needs no verification record",
  withEnv(async () => {
    const { ctx, calls } = fakeContext({
      body: { action: 'setTenantStatus', tenantId: 't1', status: 'rejected' },
      databases: {
        getRow: async () => pendingTenant(),
        updateRow: async () => ({}),
        listRows: async () => ({ rows: [] }),
      },
    });

    const result = await handleTenantMembershipRequest(ctx);

    assert.equal(result.status, 200);
    assert.deepEqual(calls.updateRow[0][0].data, { status: 'rejected' });
  }),
);
