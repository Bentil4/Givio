export class FakeClient {
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

export const ADMIN_HEADERS = { 'x-appwrite-user-jwt': 'admin-jwt', 'x-appwrite-key': 'key' };
export const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });
export const asOperator = async () => ({ $id: 'op-1', labels: ['operator'] });

export function withInboxEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID = 'support-1';
    process.env.APPWRITE_TENANTS_COLLECTION_ID = 'tenants-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_SUPPORT_REQUESTS_COLLECTION_ID;
      delete process.env.APPWRITE_TENANTS_COLLECTION_ID;
    }
  };
}

export function inboxContext({ body, getAccount = asAdmin, tables = {}, users = {} }) {
  const calls = { listRows: [], updateRow: [], usersList: [] };
  const errors = [];
  const logs = [];

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }
  class TablesDBCtor {
    async listRows(args) {
      calls.listRows.push(args);
      return tables.listRows ? tables.listRows(args) : { rows: [] };
    }
    async updateRow(args) {
      calls.updateRow.push(args);
      return tables.updateRow ? tables.updateRow(args) : { $id: args.rowId, ...args.data };
    }
  }
  class UsersCtor {
    async list(args) {
      calls.usersList.push(args);
      return users.list ? users.list(args) : { users: [] };
    }
  }
  const res = { json: (responseBody, status = 200) => ({ body: responseBody, status }) };

  return {
    ctx: {
      req: { bodyRaw: JSON.stringify(body), headers: ADMIN_HEADERS },
      res,
      log: (msg) => logs.push(msg),
      error: (msg) => errors.push(msg),
      ClientCtor: FakeClient,
      AccountCtor,
      TablesDBCtor,
      UsersCtor,
    },
    calls,
    errors,
    logs,
  };
}
