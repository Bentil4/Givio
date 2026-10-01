import { handleTenantMembershipRequest } from '../../src/tenant-membership.js';
import { seedStore, ACCOUNTS } from './team-management-fixtures.js';

// Story 8.1: the team-management store (tenant-a approved with a Super Organizer, an Organizer,
// an Operator and a revoked Organizer; tenant-b alongside) run through a fake that also records
// session revocation, so a suspension's sign-out sweep is observed rather than assumed.

export { seedStore, ACCOUNTS };

export const ADMIN_ONLY = ['read("label:admin")', 'update("label:admin")', 'delete("label:admin")'];

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

function matches(row, queries = []) {
  return queries
    .map((q) => JSON.parse(q))
    .every((q) => {
      if (q.method === 'equal') return q.values.includes(row[q.attribute]);
      if (q.method === 'contains')
        return (row[q.attribute] ?? []).some((v) => q.values.includes(v));
      return true;
    });
}

/** `failOn` maps a call name to a predicate (or `true`) deciding which calls throw. */
function tracker({ calls, failOn }) {
  return (name, args) => {
    calls[name] = calls[name] ?? [];
    calls[name].push(args);
    const failure = failOn[name];
    if (failure === true || (typeof failure === 'function' && failure(args))) {
      throw Object.assign(new Error(`${name} failed`), { code: failOn[`${name}Code`] ?? 500 });
    }
  };
}

function fakeTablesDB({ store, track }) {
  return class DatabasesCtor {
    async getRow(args) {
      track('getRow', args);
      const row = store[args.tableId]?.[args.rowId];
      if (!row) throw Object.assign(new Error('Row not found'), { code: 404 });
      return structuredClone(row);
    }
    async listRows(args) {
      track('listRows', args);
      const rows = Object.values(store[args.tableId] ?? {}).filter((r) => matches(r, args.queries));
      return { rows: structuredClone(rows) };
    }
    async updateRow(args) {
      track('updateRow', args);
      const row = store[args.tableId][args.rowId];
      Object.assign(row, args.data);
      if (args.permissions) row.$permissions = args.permissions;
      return structuredClone(row);
    }
  };
}

function fakeUsers({ accounts, track }) {
  return class UsersCtor {
    async get(args) {
      track('usersGet', args);
      if (!accounts[args.userId]) throw Object.assign(new Error('User not found'), { code: 404 });
      return accounts[args.userId];
    }
    async deleteSessions(args) {
      track('deleteSessions', args);
      return {};
    }
    async updateLabels(args) {
      track('updateLabels', args);
      accounts[args.userId].labels = args.labels;
      return accounts[args.userId];
    }
  };
}

export function fakeContext({ body, as = 'admin-1', store = seedStore(), failOn = {} }) {
  const calls = {};
  const errors = [];
  const accounts = structuredClone(ACCOUNTS);
  const track = tracker({ calls, failOn });
  class AccountCtor {
    async get() {
      return accounts[as];
    }
  }
  const DatabasesCtor = fakeTablesDB({ store, track });
  const ctx = {
    req: {
      bodyRaw: JSON.stringify(body),
      headers: { 'x-appwrite-user-jwt': `${as}-jwt`, 'x-appwrite-key': 'dynamic-key' },
    },
    res: { json: (responseBody, status = 200) => ({ body: responseBody, status }) },
    log: () => {},
    error: (msg) => errors.push(msg),
    ClientCtor: FakeClient,
    AccountCtor,
    UsersCtor: fakeUsers({ accounts, track }),
    DatabasesCtor,
    TablesDBCtor: DatabasesCtor,
  };
  return { ctx, store, calls, errors };
}

export async function run(options, handler = handleTenantMembershipRequest) {
  const context = fakeContext(options);
  const result = await handler(context.ctx);
  return { result, ...context };
}

export function withEnv(fn) {
  const vars = {
    APPWRITE_DATABASE_ID: 'db-1',
    APPWRITE_EVENTS_COLLECTION_ID: 'events-1',
    APPWRITE_DONATIONS_COLLECTION_ID: 'donations-1',
    APPWRITE_TENANTS_COLLECTION_ID: 'tenants-1',
    APPWRITE_MEMBERSHIPS_COLLECTION_ID: 'memberships-1',
  };
  return async () => {
    Object.assign(process.env, vars);
    try {
      await fn();
    } finally {
      for (const key of Object.keys(vars)) delete process.env[key];
    }
  };
}

export const suspend = (tenantId = 'tenant-a') => ({ action: 'suspendTenant', tenantId });

export const setStatus = (status, tenantId = 'tenant-a') => ({
  action: 'setTenantStatus',
  tenantId,
  status,
});

export const designate = (membershipId, tenantId = 'tenant-a') => ({
  action: 'designateSuperOrganizer',
  tenantId,
  membershipId,
});

export function signedOutUserIds(calls) {
  return (calls.deleteSessions ?? []).map((args) => args.userId).sort();
}
