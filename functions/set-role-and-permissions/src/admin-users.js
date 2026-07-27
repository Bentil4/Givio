import { randomBytes } from 'node:crypto';
import { Client, Account, Users, ID } from 'node-appwrite';

// Keep in sync with src/app/data/stores/auth-store.ts's ROLE_LABELS — the two run in
// separate deployments (this Function vs. the Angular app) with no shared module system,
// so there's no way to import one list into the other; update both by hand.
const VALID_ROLES = ['admin', 'operator'];

const ACTIONS = ['listUsers', 'createUser', 'updateUser', 'setRole', 'setStatus'];

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

async function handleListUsers({ UsersCtor, adminClient, error }) {
  try {
    const list = await new UsersCtor(adminClient).list();
    return { status: 200, body: list.users.map(mapUser) };
  } catch (err) {
    error(`listUsers failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to list users' } };
  }
}

async function handleCreateUser({ UsersCtor, adminClient, payload, error }) {
  const { name, email, role, password } = payload ?? {};

  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    typeof email !== 'string' ||
    email.length === 0 ||
    !VALID_ROLES.includes(role)
  ) {
    return {
      status: 400,
      body: { error: 'Request must include name, email, and role ("admin" | "operator")' },
    };
  }

  const users = new UsersCtor(adminClient);
  const generatedPassword = password ?? randomBytes(12).toString('base64url');

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
    body: { success: true, userId: user.$id, ...(password ? {} : { generatedPassword }) },
  };
}

async function handleUpdateUser({ UsersCtor, adminClient, payload, error }) {
  const { userId, name, email, role } = payload ?? {};

  if (typeof userId !== 'string' || userId.length === 0) {
    return { status: 400, body: { error: 'Request must include userId' } };
  }
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return { status: 400, body: { error: 'role must be "admin" or "operator"' } };
  }

  const users = new UsersCtor(adminClient);

  if (typeof name === 'string' && name.length > 0) {
    try {
      await users.updateName({ userId, name });
    } catch (err) {
      error(`updateName failed: ${err.message}`);
      return { status: 502, body: { error: 'Failed to update name' } };
    }
  }

  if (typeof email === 'string' && email.length > 0) {
    try {
      await users.updateEmail({ userId, email });
      await users.updateEmailVerification({ userId, emailVerification: false });
    } catch (err) {
      if (isDuplicateEmailError(err)) {
        return { status: 409, body: { error: 'A user with this email already exists' } };
      }
      error(`updateEmail failed: ${err.message}`);
      return { status: 502, body: { error: 'Failed to update email' } };
    }
  }

  if (role !== undefined) {
    try {
      await users.updateLabels({ userId, labels: [role] });
    } catch (err) {
      error(`updateLabels failed: ${err.message}`);
      return { status: 502, body: { error: 'Failed to update role' } };
    }
  }

  return { status: 200, body: { success: true, userId } };
}

async function handleSetRole({ UsersCtor, adminClient, payload, caller, error }) {
  const { userId, role } = payload ?? {};

  if (typeof userId !== 'string' || userId.length === 0 || !VALID_ROLES.includes(role)) {
    return {
      status: 400,
      body: { error: 'Request must include userId and role ("admin" | "operator")' },
    };
  }

  try {
    await new UsersCtor(adminClient).updateLabels({ userId, labels: [role] });
  } catch (err) {
    error(`updateLabels failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to update role' } };
  }

  return { status: 200, body: { success: true, userId, role } };
}

async function handleSetStatus({ UsersCtor, adminClient, payload, error }) {
  const { userId, active } = payload ?? {};

  if (typeof userId !== 'string' || userId.length === 0 || typeof active !== 'boolean') {
    return { status: 400, body: { error: 'Request must include userId and a boolean active' } };
  }

  try {
    await new UsersCtor(adminClient).updateStatus({ userId, status: active });
  } catch (err) {
    error(`updateStatus failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to update user status' } };
  }

  return { status: 200, body: { success: true, userId, active } };
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
  if (!ACTIONS.includes(action)) {
    return res.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, 400);
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
    case 'setRole':
      result = await handleSetRole(actionContext);
      break;
    case 'setStatus':
      result = await handleSetStatus(actionContext);
      break;
  }

  if (result.status === 200) {
    log(`${action} succeeded (by admin ${caller.$id}): ${JSON.stringify(result.body)}`);
  }
  return res.json(result.body, result.status);
}
