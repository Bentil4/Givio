// Story 6.7: Organizer event actions run against a small in-memory store that honours the
// equal queries the Function sends, so tenant scoping is exercised rather than assumed.

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

const membership = (userId, tenantId, role, status = 'active') => ({
  $id: `m-${userId}`,
  userId,
  tenantId,
  role,
  status,
});

const event = (id, extra) => ({
  $id: id,
  name: `Event ${id}`,
  type: 'funeral',
  date: '2026-10-10',
  hostName: 'The Family',
  status: 'active',
  assignedUserIds: [],
  $permissions: [],
  ...extra,
});

export function seedStore() {
  return {
    'tenants-1': {
      'tenant-a': { $id: 'tenant-a', status: 'approved' },
      'tenant-b': { $id: 'tenant-b', status: 'approved' },
      'tenant-p': { $id: 'tenant-p', status: 'pending' },
      'tenant-r': { $id: 'tenant-r', status: 'rejected' },
      'tenant-s': { $id: 'tenant-s', status: 'suspended' },
    },
    'memberships-1': Object.fromEntries(
      [
        membership('so-a', 'tenant-a', 'super_organizer'),
        membership('org-a', 'tenant-a', 'organizer'),
        membership('op-a', 'tenant-a', 'operator'),
        membership('gone-a', 'tenant-a', 'operator', 'revoked'),
        membership('so-b', 'tenant-b', 'super_organizer'),
        membership('op-b', 'tenant-b', 'operator'),
        membership('so-p', 'tenant-p', 'super_organizer'),
        membership('so-r', 'tenant-r', 'super_organizer'),
        membership('so-s', 'tenant-s', 'super_organizer'),
      ].map((m) => [m.$id, m]),
    ),
    'events-1': {
      'event-a1': event('event-a1', { tenantId: 'tenant-a' }),
      'event-a-closed': event('event-a-closed', { tenantId: 'tenant-a', status: 'closed' }),
      'event-b1': event('event-b1', { tenantId: 'tenant-b' }),
      'event-admin': event('event-admin', {}),
    },
    'donations-1': {},
    'audit-1': {},
  };
}

const unlabelled = ['so-a', 'org-a', 'so-b', 'so-p', 'so-r', 'so-s', 'nobody'];

export const ACCOUNTS = {
  ...Object.fromEntries(unlabelled.map((id) => [id, { $id: id, labels: [] }])),
  'admin-1': { $id: 'admin-1', labels: ['admin'] },
  'op-a': { $id: 'op-a', labels: ['operator'] },
  'gone-a': { $id: 'gone-a', labels: [] },
  'op-b': { $id: 'op-b', labels: ['operator'] },
};

function matches(row, queries) {
  return queries
    .map((q) => JSON.parse(q))
    .every((q) => q.method !== 'equal' || q.values.includes(row[q.attribute]));
}

function fakeDatabases(store, calls, failOn) {
  const track = (name, args) => {
    calls[name] = [...(calls[name] ?? []), args];
    if (failOn[name]) throw new Error(`${name} failed`);
  };
  return class DatabasesCtor {
    async getRow(args) {
      track('getRow', args);
      const row = store[args.tableId]?.[args.rowId];
      if (!row) throw new Error('Row not found');
      return row;
    }
    async listRows(args) {
      track('listRows', args);
      return {
        rows: Object.values(store[args.tableId] ?? {}).filter((r) => matches(r, args.queries)),
      };
    }
    async createRow(args) {
      track('createRow', args);
      const row = { $id: args.rowId, ...args.data, $permissions: args.permissions };
      store[args.tableId][row.$id] = row;
      return row;
    }
    async updateRow(args) {
      track('updateRow', args);
      const row = store[args.tableId][args.rowId];
      Object.assign(row, args.data);
      if (args.permissions) row.$permissions = args.permissions;
      return row;
    }
  };
}

export function fakeContext({ body, as, store = seedStore(), failOn = {}, headers }) {
  const calls = {};
  const errors = [];
  const DatabasesCtor = fakeDatabases(store, calls, failOn);
  class AccountCtor {
    async get() {
      return ACCOUNTS[as];
    }
  }
  const res = { json: (responseBody, status = 200) => ({ body: responseBody, status }) };
  const ctx = {
    req: {
      bodyRaw: JSON.stringify(body),
      headers: headers ?? { 'x-appwrite-user-jwt': `${as}-jwt`, 'x-appwrite-key': 'dynamic-key' },
    },
    res,
    log: () => {},
    error: (msg) => errors.push(msg),
    ClientCtor: FakeClient,
    AccountCtor,
    DatabasesCtor,
    TablesDBCtor: DatabasesCtor,
    randomBytes: (n) => Buffer.alloc(n, 1),
  };
  return { ctx, store, calls, errors };
}

const ENV = {
  APPWRITE_DATABASE_ID: 'db-1',
  APPWRITE_EVENTS_COLLECTION_ID: 'events-1',
  APPWRITE_DONATIONS_COLLECTION_ID: 'donations-1',
  APPWRITE_TENANTS_COLLECTION_ID: 'tenants-1',
  APPWRITE_MEMBERSHIPS_COLLECTION_ID: 'memberships-1',
  APPWRITE_AUDIT_LOGS_COLLECTION_ID: 'audit-1',
};

export function withEnv(fn, overrides = {}) {
  return async () => {
    const env = { ...ENV, ...overrides };
    Object.entries(env).forEach(([key, value]) => setEnv(key, value));
    try {
      await fn();
    } finally {
      Object.keys(env).forEach((key) => delete process.env[key]);
    }
  };
}

function setEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

export function auditRows(store) {
  return Object.values(store['audit-1']).map((row) => ({
    ...row,
    previousValues: JSON.parse(row.previousValues),
    newValues: JSON.parse(row.newValues),
  }));
}

export const NEW_EVENT = {
  action: 'createTenantEvent',
  name: 'Odoi Funeral Service',
  type: 'funeral',
  date: '2026-11-02',
  hostName: 'The Odoi Family',
  venue: 'Osu Presbyterian Church',
};
