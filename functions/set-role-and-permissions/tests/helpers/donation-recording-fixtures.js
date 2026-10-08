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

export function fakeContext({ body, headers = {}, getAccount, tablesDB = {} }) {
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

  const fetchDonation = async (args) => {
    calls.getDonation = calls.getDonation ?? [];
    calls.getDonation.push([args]);
    if (!tablesDB.getDonation) {
      throw Object.assign(new Error('not found'), { code: 404 });
    }
    return tablesDB.getDonation(args);
  };

  class AccountCtor {
    async get() {
      return getAccount();
    }
  }

  class TablesDBCtor {
    // A Donation lookup (the idempotency check) is answered apart from the Event read, so the
    // per-test `getRow` fakes keep meaning "the Event"; `getDonation` seeds an earlier row.
    getRow = async (args) => {
      if (args.tableId === 'donations-1') {
        return fetchDonation(args);
      }
      return record('getRow', tablesDB)(args);
    };
    createRow = record('createRow', tablesDB);
    incrementRowColumn = record('incrementRowColumn', tablesDB);
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
export const OPERATOR_HEADERS = {
  'x-appwrite-user-jwt': 'op-jwt',
  'x-appwrite-key': 'dynamic-key',
};
export const asAdmin = async () => ({ $id: 'admin-1', labels: ['admin'] });
export const asOperator = (id) => async () => ({ $id: id, labels: ['operator'] });

export const BASE_PAYLOAD = {
  action: 'recordDonation',
  donationId: 'd1',
  eventId: 'e1',
  receiptNumber: 'P-1',
  donorName: 'Ama',
  amountMinor: 5000,
  donationType: 'cash',
  recordedAt: '2026-01-01T00:00:00.000Z',
};

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
