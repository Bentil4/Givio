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

export function fakeContext({ body, headers = {}, getAccount, tablesDB = {}, randomBytes }) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];
  const calls = {};

  const record =
    (name, target) =>
    async (...args) => {
      calls[name] = calls[name] ?? [];
      calls[name].push(args);
      const impl = target[name];
      return impl ? impl(...args) : undefined;
    };

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }

  class TablesDBCtor {
    getRow = record('getRow', tablesDB);
    listRows = record('listRows', tablesDB);
    updateRow = record('updateRow', tablesDB);
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
      TablesDBCtor,
      randomBytes: randomBytes ?? ((n) => Buffer.alloc(n, 1)),
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
// resolveAccessCode is unauthenticated (no user JWT) but the Function's own execution API key
// is still present on every invocation regardless of action — it's not a user credential.
export const PUBLIC_HEADERS = { 'x-appwrite-key': 'dynamic-key' };
export const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });

export function withEnv(fn) {
  return async () => {
    process.env.APPWRITE_DATABASE_ID = 'db-1';
    process.env.APPWRITE_EVENTS_COLLECTION_ID = 'events-1';
    process.env.APPWRITE_DONATIONS_COLLECTION_ID = 'donations-1';
    try {
      await fn();
    } finally {
      delete process.env.APPWRITE_DATABASE_ID;
      delete process.env.APPWRITE_EVENTS_COLLECTION_ID;
      delete process.env.APPWRITE_DONATIONS_COLLECTION_ID;
    }
  };
}
