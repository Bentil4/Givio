import { handleTenantMembershipRequest } from '../../src/tenant-membership.js';

// Story 7.1: Organizer-tier team management through addTeamMember / revokeMembership /
// listTeamMembers, run against a small in-memory store that honours the equal/contains queries
// the Function actually sends — so tenant scoping is exercised, not assumed.

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

function matches(row, queries) {
  return queries
    .map((q) => JSON.parse(q))
    .every((q) => {
      if (q.method === 'equal') return q.values.includes(row[q.attribute]);
      if (q.method === 'contains') {
        return (row[q.attribute] ?? []).some((v) => q.values.includes(v));
      }
      return true;
    });
}

export function seedStore() {
  return {
    'tenants-1': {
      'tenant-a': {
        $id: 'tenant-a',
        status: 'approved',
        superOrganizerId: 'so-a',
        $permissions: ['read("label:admin")', 'read("user:so-a")'],
      },
      'tenant-b': { $id: 'tenant-b', status: 'approved', superOrganizerId: 'so-b' },
      'tenant-p': { $id: 'tenant-p', status: 'pending', superOrganizerId: 'so-p' },
    },
    'memberships-1': {
      'm-so-a': {
        $id: 'm-so-a',
        userId: 'so-a',
        tenantId: 'tenant-a',
        role: 'super_organizer',
        status: 'active',
      },
      'm-org-a': {
        $id: 'm-org-a',
        userId: 'org-a',
        tenantId: 'tenant-a',
        role: 'organizer',
        status: 'active',
      },
      'm-op-a': {
        $id: 'm-op-a',
        userId: 'op-a',
        tenantId: 'tenant-a',
        role: 'operator',
        status: 'active',
      },
      'm-gone-a': {
        $id: 'm-gone-a',
        userId: 'gone-a',
        tenantId: 'tenant-a',
        role: 'organizer',
        status: 'revoked',
      },
      'm-so-b': {
        $id: 'm-so-b',
        userId: 'so-b',
        tenantId: 'tenant-b',
        role: 'super_organizer',
        status: 'active',
      },
      'm-op-b': {
        $id: 'm-op-b',
        userId: 'op-b',
        tenantId: 'tenant-b',
        role: 'operator',
        status: 'active',
      },
      'm-so-p': {
        $id: 'm-so-p',
        userId: 'so-p',
        tenantId: 'tenant-p',
        role: 'super_organizer',
        status: 'active',
      },
    },
    'events-1': {
      'event-a1': {
        $id: 'event-a1',
        tenantId: 'tenant-a',
        assignedUserIds: ['org-a', 'op-a'],
        $permissions: ['read("user:op-a")'],
      },
    },
    // Story 7.2: screening fails closed without these, so every team add needs them.
    'identity-flags-1': {},
    'identity-reviews-1': {},
  };
}

export const ACCOUNTS = {
  'admin-1': { $id: 'admin-1', name: 'Admin', email: 'admin@givio.app', labels: ['admin'] },
  'so-a': { $id: 'so-a', name: 'Yaw Asante', email: 'yaw@a.co', labels: [] },
  'org-a': { $id: 'org-a', name: 'Ama Owusu', email: 'ama@a.co', labels: [] },
  'op-a': { $id: 'op-a', name: 'Kwesi Boateng', email: 'kwesi@a.co', labels: ['operator'] },
  'gone-a': { $id: 'gone-a', name: 'Gone', email: 'gone@a.co', labels: [] },
  'so-b': { $id: 'so-b', name: 'Other Boss', email: 'boss@b.co', labels: [] },
  'op-b': { $id: 'op-b', name: 'Other Op', email: 'op@b.co', labels: ['operator'] },
  'so-p': { $id: 'so-p', name: 'Pending Boss', email: 'boss@p.co', labels: [] },
  nobody: { $id: 'nobody', name: 'No Relationship', email: 'no@x.co', labels: [] },
};

function fakeContext({ body, as, store = seedStore(), accounts, failOn = {} }) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];
  const calls = {};
  const accountStore = structuredClone(accounts ?? ACCOUNTS);
  let nextId = 0;

  const track = (name, args) => {
    calls[name] = calls[name] ?? [];
    calls[name].push([args]);
    if (failOn[name]) throw new Error(`${name} failed`);
  };

  class AccountCtor {
    async get() {
      return accountStore[as];
    }
  }

  class DatabasesCtor {
    async getRow(args) {
      track('getRow', args);
      const row = store[args.tableId]?.[args.rowId];
      if (!row) throw new Error('Row not found');
      return row;
    }
    async listRows(args) {
      track('listRows', args);
      const rows = Object.values(store[args.tableId] ?? {}).filter((r) => matches(r, args.queries));
      return { rows };
    }
    async createRow(args) {
      track('createRow', args);
      if (store[args.tableId][args.rowId]) throw Object.assign(new Error('exists'), { code: 409 });
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
  }

  class UsersCtor {
    async get(args) {
      track('usersGet', args);
      const account = accountStore[args.userId];
      if (!account) throw new Error('User not found');
      return account;
    }
    async create(args) {
      track('usersCreate', args);
      const userId = `new-${++nextId}`;
      accountStore[userId] = { $id: userId, name: args.name, email: args.email, labels: [] };
      return accountStore[userId];
    }
    async updateLabels(args) {
      track('updateLabels', args);
      accountStore[args.userId].labels = args.labels;
      return accountStore[args.userId];
    }
    async updateStatus(args) {
      track('usersUpdateStatus', args);
      accountStore[args.userId].status = args.status;
      return accountStore[args.userId];
    }
    async deleteSessions(args) {
      track('usersDeleteSessions', args);
      return {};
    }
  }

  const res = {
    json(responseBody, status = 200) {
      const result = { body: responseBody, status };
      jsonCalls.push(result);
      return result;
    },
  };

  return {
    ctx: {
      req: {
        bodyRaw: JSON.stringify(body),
        headers: { 'x-appwrite-user-jwt': `${as}-jwt`, 'x-appwrite-key': 'dynamic-key' },
      },
      res,
      log: (msg) => logs.push(msg),
      error: (msg) => errors.push(msg),
      ClientCtor: FakeClient,
      AccountCtor,
      UsersCtor,
      DatabasesCtor,
    },
    store,
    accountStore,
    calls,
    logs,
    errors,
  };
}

export function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_EVENTS_COLLECTION_ID = 'events-1';
    process.env.APPWRITE_DONATIONS_COLLECTION_ID = 'donations-1';
    process.env.APPWRITE_TENANTS_COLLECTION_ID = 'tenants-1';
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID = 'memberships-1';
    process.env.APPWRITE_IDENTITY_FLAGS_COLLECTION_ID = 'identity-flags-1';
    process.env.APPWRITE_IDENTITY_REVIEWS_COLLECTION_ID = 'identity-reviews-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
      delete process.env.APPWRITE_DONATIONS_COLLECTION_ID;
      delete process.env.APPWRITE_TENANTS_COLLECTION_ID;
      delete process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;
      delete process.env.APPWRITE_IDENTITY_FLAGS_COLLECTION_ID;
      delete process.env.APPWRITE_IDENTITY_REVIEWS_COLLECTION_ID;
    }
  };
}

export const add = (role, extra = {}) => ({
  action: 'addTeamMember',
  name: 'Kojo Mensah',
  email: 'kojo@a.co',
  role,
  ...extra,
});

export async function run(options) {
  const context = fakeContext(options);
  const result = await handleTenantMembershipRequest(context.ctx);
  return { result, ...context };
}

export function newMembership(store) {
  return Object.values(store['memberships-1']).find((m) => m.userId?.startsWith('new-'));
}
