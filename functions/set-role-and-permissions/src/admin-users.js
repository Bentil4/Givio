import { randomBytes } from 'node:crypto';
import { Client, Account, Users, ID, Query } from 'node-appwrite';

// Keep in sync with src/app/data/stores/auth-store.ts's ROLE_LABELS — the two run in
// separate deployments (this Function vs. the Angular app) with no shared module system,
// so there's no way to import one list into the other; update both by hand.
const VALID_ROLES = ['admin', 'operator'];

const ACTIONS = ['listUsers', 'createUser', 'updateUser', 'setStatus', 'forceExpireSessions'];

const LIST_PAGE_SIZE = 100;

function buildClient(ClientCtor, endpoint, projectId) {
  return new ClientCtor().setEndpoint(endpoint).setProject(projectId);
}

function mapUser(u) {
  return {
    id: u.$id,
    name: u.name,
    email: u.email,
    role: VALID_ROLES.find((r) => (u.labels ?? []).includes(r)) ?? null,
    active: u.status,
    registeredAt: u.registration,
  };
}

function isDuplicateEmailError(err) {
  return err?.code === 409 || err?.type === 'user_already_exists';
}

function hasValue(field) {
  return typeof field === 'string' && field.length > 0;
}

/**
 * Verifies the caller via their JWT (never the spoofable x-appwrite-user-id header) —
 * runs before any action-specific payload parsing/validation, so an unauthenticated or
 * non-admin caller always gets 401/403 first, regardless of what action they asked for.
 */
async function verifyAdminCaller({ req, ClientCtor, AccountCtor, endpoint, projectId, error }) {
  const callerJwt = req.headers['x-appwrite-user-jwt'];
  if (!callerJwt) {
    return { errorResponse: { status: 401, body: { error: 'Unauthenticated' } } };
  }

  const callerClient = buildClient(ClientCtor, endpoint, projectId).setJWT(callerJwt);

  let caller;
  try {
    caller = await new AccountCtor(callerClient).get();
  } catch (err) {
    error(`Caller JWT verification failed: ${err.message}`);
    return { errorResponse: { status: 401, body: { error: 'Unauthenticated' } } };
  }

  if (!(caller.labels ?? []).includes('admin')) {
    return { errorResponse: { status: 403, body: { error: 'Forbidden' } } };
  }

  return { caller };
}

const VALID = { valid: true };

function invalid(error) {
  return { valid: false, body: { error } };
}

/** Shared by every action that must not let an admin target their own account. */
function rejectSelfTarget(userId, caller, error) {
  return userId === caller.$id ? invalid(error) : VALID;
}

const PAYLOAD_VALIDATORS = {
  listUsers: () => VALID,

  createUser: ({ name, email, role }) =>
    hasValue(name) && hasValue(email) && VALID_ROLES.includes(role)
      ? VALID
      : invalid('Request must include name, email, and role ("admin" | "operator")'),

  updateUser: ({ userId, role }, caller) => {
    if (!hasValue(userId)) {
      return invalid('Request must include userId');
    }
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return invalid('role must be "admin" or "operator"');
    }
    if (role !== undefined) {
      return rejectSelfTarget(userId, caller, 'Cannot change your own role');
    }
    return VALID;
  },

  setStatus: ({ userId, active }, caller) => {
    if (!hasValue(userId) || typeof active !== 'boolean') {
      return invalid('Request must include userId and a boolean active');
    }
    return rejectSelfTarget(userId, caller, 'Cannot change your own account status');
  },

  forceExpireSessions: ({ userId }, caller) => {
    if (!hasValue(userId)) {
      return invalid('Request must include userId');
    }
    return rejectSelfTarget(userId, caller, 'Cannot force-expire your own sessions');
  },
};

/**
 * Validates each action's payload shape (and any caller-independent business rule, like
 * "can't change your own status/role") *before* the dynamic-key check runs, so a genuinely
 * malformed request always gets 400, never a 500 that masks it as a server misconfiguration.
 */
function validatePayload(action, payload, caller) {
  const validator = PAYLOAD_VALIDATORS[action];
  if (!validator) {
    return invalid(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  return validator(payload ?? {}, caller);
}

async function handleListUsers({ UsersCtor, adminClient, error }) {
  const users = new UsersCtor(adminClient);
  const all = [];

  try {
    let cursor;
    for (;;) {
      const queries = [Query.limit(LIST_PAGE_SIZE)];
      if (cursor) {
        queries.push(Query.cursorAfter(cursor));
      }
      const page = await users.list({ queries });
      all.push(...page.users);
      if (page.users.length < LIST_PAGE_SIZE) {
        break;
      }
      cursor = page.users[page.users.length - 1].$id;
    }
  } catch (err) {
    error(`listUsers failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to list users' } };
  }

  return { status: 200, body: all.map(mapUser) };
}

async function handleCreateUser({ UsersCtor, adminClient, payload, error }) {
  const { name, email, role, password } = payload ?? {};
  const users = new UsersCtor(adminClient);
  const explicitPassword = hasValue(password);
  const generatedPassword = explicitPassword ? password : randomBytes(12).toString('base64url');

  let user;
  try {
    user = await users.create({ userId: ID.unique(), email, password: generatedPassword, name });
  } catch (err) {
    if (isDuplicateEmailError(err)) {
      return { status: 409, body: { error: 'A user with this email already exists' } };
    }
    error(`users.create failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to create user' } };
  }

  try {
    await users.updateLabels({ userId: user.$id, labels: [role] });
  } catch (err) {
    error(`updateLabels failed after user creation: ${err.message}`);
    return { status: 502, body: { error: 'User created but failed to set role' } };
  }

  return {
    status: 200,
    body: { success: true, userId: user.$id, ...(explicitPassword ? {} : { generatedPassword }) },
  };
}

/**
 * Runs the name/email/role updates concurrently (they're independent Appwrite calls) via
 * Promise.allSettled rather than sequential awaits — this also means a failure in one field
 * doesn't abort the others, and the response reports exactly which fields actually applied,
 * so a partial failure is never silently indistinguishable from total failure.
 */
async function handleUpdateUser({ UsersCtor, adminClient, payload, error }) {
  const { userId, name, email, role } = payload ?? {};
  const users = new UsersCtor(adminClient);

  const tasks = [];

  if (hasValue(name)) {
    tasks.push({ field: 'name', run: () => users.updateName({ userId, name }) });
  }

  if (hasValue(email)) {
    tasks.push({
      field: 'email',
      run: async () => {
        const current = await users.get({ userId });
        if (current.email === email) {
          return;
        }
        await users.updateEmail({ userId, email });
        await users.updateEmailVerification({ userId, emailVerification: false });
      },
    });
  }

  if (role !== undefined) {
    tasks.push({ field: 'role', run: () => users.updateLabels({ userId, labels: [role] }) });
  }

  if (tasks.length === 0) {
    return { status: 200, body: { success: true, userId, appliedFields: [] } };
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));

  const appliedFields = [];
  let duplicateEmail = false;
  let failed = false;

  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      appliedFields.push(tasks[index].field);
      return;
    }
    failed = true;
    if (isDuplicateEmailError(outcome.reason)) {
      duplicateEmail = true;
    }
    error(`updateUser: ${tasks[index].field} failed: ${outcome.reason?.message}`);
  });

  if (failed) {
    if (duplicateEmail) {
      return {
        status: 409,
        body: { error: 'A user with this email already exists', appliedFields },
      };
    }
    return { status: 502, body: { error: 'Failed to update user', appliedFields } };
  }

  return { status: 200, body: { success: true, userId, appliedFields } };
}

async function handleSetStatus({ UsersCtor, adminClient, payload, error }) {
  const { userId, active } = payload ?? {};

  try {
    await new UsersCtor(adminClient).updateStatus({ userId, status: active });
  } catch (err) {
    error(`updateStatus failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to update user status' } };
  }

  return { status: 200, body: { success: true, userId, active } };
}

async function handleForceExpireSessions({ UsersCtor, adminClient, payload, error }) {
  const { userId } = payload ?? {};

  try {
    await new UsersCtor(adminClient).deleteSessions({ userId });
  } catch (err) {
    error(`deleteSessions failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to force sign-out' } };
  }

  return { status: 200, body: { success: true, userId } };
}

/**
 * The sole writer of user Labels and the only place that can list/create/update/disable
 * user accounts (AD-9) — Appwrite's Users service is server-only, so every one of these
 * actions is only possible here, never from the client SDK directly.
 *
 * ClientCtor/AccountCtor/UsersCtor are injectable so tests can substitute fakes without
 * module-mocking node-appwrite.
 */
export async function handleAdminUsersRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  UsersCtor = Users,
}) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;

  const { errorResponse, caller } = await verifyAdminCaller({
    req,
    ClientCtor,
    AccountCtor,
    endpoint,
    projectId,
    error,
  });
  if (errorResponse) {
    return res.json(errorResponse.body, errorResponse.status);
  }

  let body;
  try {
    body = JSON.parse(req.bodyRaw || '{}');
  } catch {
    return res.json({ error: 'Invalid JSON body' }, 400);
  }

  const { action, ...payload } = body ?? {};

  const validation = validatePayload(action, payload, caller);
  if (!validation.valid) {
    return res.json(validation.body, 400);
  }

  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error('Missing x-appwrite-key — the Function\'s execution API key scopes are likely misconfigured.');
    return res.json({ error: 'Server misconfiguration: missing execution API key' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);
  const actionContext = { UsersCtor, adminClient, payload, caller, error };

  let result;
  switch (action) {
    case 'listUsers':
      result = await handleListUsers(actionContext);
      break;
    case 'createUser':
      result = await handleCreateUser(actionContext);
      break;
    case 'updateUser':
      result = await handleUpdateUser(actionContext);
      break;
    case 'setStatus':
      result = await handleSetStatus(actionContext);
      break;
    case 'forceExpireSessions':
      result = await handleForceExpireSessions(actionContext);
      break;
  }

  if (result.status === 200) {
    log(`${action} succeeded (by admin ${caller.$id}): ${JSON.stringify(result.body)}`);
  }
  return res.json(result.body, result.status);
}
