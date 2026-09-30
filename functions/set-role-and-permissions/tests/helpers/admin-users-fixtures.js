import { handleAdminUsersRequest } from '../../src/admin-users.js';

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
  users = {},
  messaging = {},
  fetchImpl,
}) {
  const jsonCalls = [];
  const logs = [];
  const errors = [];
  const calls = {};

  // async so a fake impl that throws synchronously still produces a rejected promise,
  // matching the real node-appwrite SDK's contract (its methods never throw synchronously).
  const record =
    (name, impls = users) =>
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

  class UsersCtor {
    list = record('list');
    get = record('get');
    create = record('create');
    updateName = record('updateName');
    updateEmail = record('updateEmail');
    updateEmailVerification = record('updateEmailVerification');
    updateLabels = record('updateLabels');
    updateStatus = record('updateStatus');
    deleteSessions = record('deleteSessions');
  }

  class MessagingCtor {
    createEmail = record('createEmail', messaging);
  }

  const res = {
    json(body, status = 200) {
      const result = { body, status };
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
      MessagingCtor,
      fetchImpl: fetchImpl ?? (async () => ({ ok: true, status: 200 })),
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
export const asSuperAdmin = async () => ({ $id: 'super-1', labels: ['admin', 'superadmin'] });
// Default fake: users.get() returns a different email than any update payload, so the
// "did the email actually change" check passes through to a real update unless a test
// overrides `users.get` to simulate "no change".
export const defaultUsersGet = () => ({ email: 'unchanged-elsewhere@givio.test' });

export const adminTarget = () => ({ $id: 'admin-2', email: 'a2@givio.test', labels: ['admin'] });
export const operatorTarget = () => ({
  $id: 'op-9',
  email: 'op9@givio.test',
  labels: ['operator'],
});
export const superAdminTarget = () => ({ $id: 'super-2', labels: ['admin', 'superadmin'] });

export async function run({ body, getAccount, users }) {
  const context = fakeContext({ body, headers: ADMIN_HEADERS, getAccount, users });
  const result = await handleAdminUsersRequest(context.ctx);
  return { result, ...context };
}
