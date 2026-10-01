// Story 7.4: an in-memory tables store that honours the equal/notEqual/between queries the
// duplicate check sends and the flags table's unique pairKey, so both are exercised for real.

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

export const event = (id, extra) => ({
  $id: id,
  name: 'Funeral of the Late Mr Kwame Mensah',
  hostName: 'The Mensah Family',
  type: 'funeral',
  date: '2026-11-07T00:00:00.000+00:00',
  venue: 'Osu Presbyterian Church',
  status: 'active',
  tenantId: 'tenant-a',
  ...extra,
});

export function seedStore(events = []) {
  return {
    'events-1': Object.fromEntries(events.map((row) => [row.$id, row])),
    'tenants-1': {
      'tenant-a': { $id: 'tenant-a', name: 'Asante Events' },
      'tenant-b': { $id: 'tenant-b', name: 'Mensah Funeral Services' },
    },
    'flags-1': {},
  };
}

const QUERY_MATCHERS = {
  equal: (value, values) => values.includes(value),
  notEqual: (value, values) => !values.includes(value),
  between: (value, [from, to]) =>
    Date.parse(value) >= Date.parse(from) && Date.parse(value) <= Date.parse(to),
};

function matches(row, queries) {
  return queries
    .map((q) => JSON.parse(q))
    .every(
      (q) => !QUERY_MATCHERS[q.method] || QUERY_MATCHERS[q.method](row[q.attribute], q.values),
    );
}

function conflict() {
  return Object.assign(new Error('Document with the requested unique key already exists'), {
    code: 409,
  });
}

export function fakeDatabases(store, calls = {}, failOn = {}) {
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
      const table = store[args.tableId];
      if (Object.values(table).some((row) => row.pairKey === args.data.pairKey)) throw conflict();
      table[args.rowId] = { $id: args.rowId, ...args.data, $permissions: args.permissions };
      return table[args.rowId];
    }
    async updateRow(args) {
      track('updateRow', args);
      return Object.assign(store[args.tableId][args.rowId], args.data);
    }
  };
}

export const ACCOUNTS = {
  'admin-1': { $id: 'admin-1', labels: ['admin'] },
  'so-a': { $id: 'so-a', labels: [] },
  'op-a': { $id: 'op-a', labels: ['operator'] },
};

export function fakeRequestContext({ body, as, store = seedStore(), failOn = {}, headers }) {
  const calls = {};
  const errors = [];
  class AccountCtor {
    async get() {
      return ACCOUNTS[as];
    }
  }
  const ctx = {
    req: {
      bodyRaw: JSON.stringify(body),
      headers: headers ?? { 'x-appwrite-user-jwt': `${as}-jwt`, 'x-appwrite-key': 'dynamic-key' },
    },
    res: { json: (responseBody, status = 200) => ({ body: responseBody, status }) },
    log: () => {},
    error: (msg) => errors.push(msg),
    ClientCtor: FakeClient,
    AccountCtor,
    DatabasesCtor: fakeDatabases(store, calls, failOn),
  };
  return { ctx, store, calls, errors };
}

const ENV = {
  APPWRITE_DATABASE_ID: 'db-1',
  APPWRITE_EVENTS_COLLECTION_ID: 'events-1',
  APPWRITE_TENANTS_COLLECTION_ID: 'tenants-1',
  APPWRITE_DUPLICATE_EVENT_FLAGS_COLLECTION_ID: 'flags-1',
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

export function flagRows(store) {
  return Object.values(store['flags-1']);
}
