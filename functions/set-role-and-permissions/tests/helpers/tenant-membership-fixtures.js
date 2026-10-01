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

export function fakeContext({
  body,
  headers = {},
  getAccount,
  databases = {},
  users = {},
  storage = {},
  messaging = {},
}) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];
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
    get = record('usersGet', users);
    create = record('usersCreate', users);
    delete = record('usersDelete', users);
    updateStatus = record('usersUpdateStatus', users);
    deleteSessions = record('usersDeleteSessions', users);
  }

  class StorageCtor {
    getFile = record('getFile', storage);
    updateFile = record('updateFile', storage);
  }

  class MessagingCtor {
    createEmail = record('createEmail', messaging);
  }

  const res = {
    json(responseBody, status = 200) {
      const result = { body: responseBody, status };
      jsonCalls.push(result);
      return result;
    },
  };

  const req = {
    bodyRaw: JSON.stringify(body),
    headers,
  };

  return {
    ctx: {
      req,
      res,
      log: (msg) => logs.push(msg),
      error: (msg) => errors.push(msg),
      ClientCtor: FakeClient,
      AccountCtor,
      UsersCtor,
      DatabasesCtor,
      StorageCtor,
      MessagingCtor,
    },
    jsonCalls,
    logs,
    errors,
    calls,
  };
}

export const ADMIN_HEADERS = {
  'x-appwrite-user-jwt': 'admin-jwt',
  'x-appwrite-key': 'dynamic-key',
};
export const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });
export const asOperator = {
  headers: { 'x-appwrite-user-jwt': 'operator-jwt' },
  getAccount: async () => ({ $id: 'op-1', labels: ['operator'] }),
};

// Baseline createMembership fixture: tenant exists, user exists, no existing active Membership.
export const CREATE_MEMBERSHIP_HAPPY_PATH_DBS = {
  getRow: async () => ({ $id: 't1', status: 'pending' }),
  listRows: async () => ({ rows: [] }),
  createRow: async () => ({ $id: 'membership-1' }),
};
export const CREATE_MEMBERSHIP_HAPPY_PATH_USERS = { usersGet: async () => ({ $id: 'u1' }) };

export function withEnv(fn) {
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

// ── Story 6.4: Organizer onboarding ─────────────────────────────────────────

export const APPLICANT_HEADERS = {
  'x-appwrite-user-jwt': 'applicant-jwt',
  'x-appwrite-key': 'dynamic-key',
};
export const asApplicant = async () => ({ $id: 'applicant-1', labels: [] });
export const COMPANY = {
  name: 'Asante Events',
  location: 'Kumasi',
  size: '11-50',
  type: 'funeral',
  estimatedUserCount: 12,
};
export const applicationBody = (overrides = {}) => ({
  action: 'submitTenantApplication',
  company: { ...COMPANY, contactPhone: '+233241234567' },
  verificationDocumentId: 'file-1',
  ...overrides,
});
export const APPLICANT_FILE = {
  $id: 'file-1',
  mimeType: 'application/pdf',
  $permissions: [
    'read("user:applicant-1")',
    'update("user:applicant-1")',
    'delete("user:applicant-1")',
  ],
};
export const APPLICATION_HAPPY_DBS = {
  listRows: async () => ({ rows: [] }),
  createRow: async ({ tableId }) => ({
    $id: tableId === 'tenants-1' ? 'tenant-new' : 'membership-new',
  }),
};
export const APPLICATION_HAPPY_STORAGE = {
  getFile: async () => APPLICANT_FILE,
  updateFile: async () => ({}),
};

export const inviteBody = (overrides = {}) => ({
  action: 'inviteOrganizer',
  name: 'Kwame Asante',
  email: 'kwame@asante.example',
  company: COMPANY,
  ...overrides,
});
