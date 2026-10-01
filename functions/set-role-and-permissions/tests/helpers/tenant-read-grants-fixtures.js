import { handleTenantGrantsRequest } from '../../src/tenant-grants.js';

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

export const ADMIN = { $id: 'admin-1', labels: ['admin'] };
const HEADERS = { 'x-appwrite-user-jwt': 'jwt', 'x-appwrite-key': 'dynamic-key' };
export const ADMIN_ONLY = ['read("label:admin")', 'update("label:admin")', 'delete("label:admin")'];
const COMPANY = {
  name: 'Kente Events',
  location: 'Accra',
  size: '11-50',
  type: 'funeral',
  estimatedUserCount: 12,
  verificationDocumentId: 'file-1',
};

const ENV = {
  APPWRITE_DATABASE_ID: 'db-1',
  APPWRITE_EVENTS_COLLECTION_ID: 'events-1',
  APPWRITE_DONATIONS_COLLECTION_ID: 'donations-1',
  APPWRITE_TENANTS_COLLECTION_ID: 'tenants-1',
  APPWRITE_MEMBERSHIPS_COLLECTION_ID: 'memberships-1',
};

export function withEnv(fn) {
  return async () => {
    Object.assign(process.env, ENV);
    try {
      await fn();
    } finally {
      for (const key of Object.keys(ENV)) delete process.env[key];
    }
  };
}

/** Tables shared across handlers, so a lifecycle action's effect is observed on real rows. */
export function inMemoryStore(tables, { failUpdate = () => false } = {}) {
  const writes = [];
  const matches = (row, query) => {
    const { method, attribute, values } = JSON.parse(query);
    if (method === 'equal') return values.includes(row[attribute]);
    if (method === 'contains') return (row[attribute] ?? []).some((v) => values.includes(v));
    return true;
  };
  const table = (tableId) => (tables[tableId] = tables[tableId] ?? []);

  class TablesDBCtor {
    async getRow({ tableId, rowId }) {
      const row = table(tableId).find((r) => r.$id === rowId);
      if (!row) throw new Error('row_not_found');
      return structuredClone(row);
    }
    async listRows({ tableId, queries = [] }) {
      const parsed = queries.map((q) => JSON.parse(q));
      const limit = parsed.find((q) => q.method === 'limit')?.values[0] ?? 25;
      const cursor = parsed.find((q) => q.method === 'cursorAfter')?.values[0];
      let rows = table(tableId).filter((r) => queries.every((q) => matches(r, q)));
      if (cursor) rows = rows.slice(rows.findIndex((r) => r.$id === cursor) + 1);
      rows = rows.slice(0, limit);
      return { total: rows.length, rows: structuredClone(rows) };
    }
    async updateRow({ tableId, rowId, data, permissions }) {
      if (failUpdate({ tableId, rowId })) throw new Error('write failed');
      const row = table(tableId).find((r) => r.$id === rowId);
      Object.assign(row, data);
      if (permissions) row.$permissions = permissions;
      writes.push({ tableId, rowId });
      return structuredClone(row);
    }
    async createRow({ tableId, rowId, data, permissions }) {
      const row = { $id: rowId, ...data, $permissions: permissions ?? [] };
      table(tableId).push(row);
      return structuredClone(row);
    }
    async incrementRowColumn({ tableId, rowId, column, value }) {
      const row = table(tableId).find((r) => r.$id === rowId);
      row[column] = (row[column] ?? 0) + value;
      return structuredClone(row);
    }
  }

  return { TablesDBCtor, tables, writes };
}

export function invoke(handler, store, body, caller = ADMIN, users = {}) {
  class AccountCtor {
    async get() {
      return caller;
    }
  }
  class UsersCtor {
    async get({ userId }) {
      return users[userId] ?? { $id: userId, labels: ['operator'] };
    }
    async create({ userId }) {
      return { $id: userId };
    }
    async updateStatus() {}
    async deleteSessions() {}
  }
  return handler({
    req: { bodyRaw: JSON.stringify(body), headers: HEADERS },
    res: { json: (responseBody, status = 200) => ({ body: responseBody, status }) },
    log: () => {},
    error: () => {},
    ClientCtor: FakeClient,
    AccountCtor,
    UsersCtor,
    DatabasesCtor: store.TablesDBCtor,
    TablesDBCtor: store.TablesDBCtor,
  });
}

export const canRead = (row, uid) => (row.$permissions ?? []).includes(`read("user:${uid}")`);
export const membership = (id, userId, role, status = 'active', tenantId = 't1') => ({
  $id: id,
  userId,
  tenantId,
  role,
  status,
});
export const donation = (id, eventId, permissions = ADMIN_ONLY) => ({
  $id: id,
  eventId,
  donorName: id,
  amountMinor: 1000,
  $permissions: [...permissions],
});

/** An approved tenant whose rows already carry correct pre-amendment operator grants. */
export function tenantFixture({ tenantStatus = 'approved', memberships, extraTables = {} } = {}) {
  const opGrant = [...ADMIN_ONLY, 'read("user:op-1")'];
  return inMemoryStore({
    'tenants-1': [
      {
        $id: 't1',
        status: tenantStatus,
        verifiedBy: 'admin-1',
        verifiedAt: '2026-09-30T00:00:00.000Z',
        ...COMPANY,
      },
    ],
    'memberships-1': memberships ?? [
      membership('m-org', 'org-1', 'super_organizer'),
      membership('m-co', 'org-2', 'organizer'),
      membership('m-op', 'op-1', 'operator'),
      membership('m-op2', 'op-2', 'operator'),
    ],
    'events-1': [
      {
        $id: 'e1',
        tenantId: 't1',
        type: 'wedding',
        status: 'active',
        assignedUserIds: ['op-1'],
        $permissions: tenantStatus === 'approved' ? opGrant : ADMIN_ONLY,
      },
      {
        $id: 'e2',
        tenantId: 't1',
        type: 'funeral',
        status: 'active',
        assignedUserIds: [],
        $permissions: ADMIN_ONLY,
      },
    ],
    'donations-1': [
      donation('d1', 'e1', tenantStatus === 'approved' ? opGrant : ADMIN_ONLY),
      donation('d2', 'e1', tenantStatus === 'approved' ? opGrant : ADMIN_ONLY),
      donation('d3', 'e2'),
    ],
    ...extraTables,
  });
}

export const backfill = (store, extra = {}) =>
  invoke(handleTenantGrantsRequest, store, { action: 'recomputeTenantReadGrants', ...extra });
