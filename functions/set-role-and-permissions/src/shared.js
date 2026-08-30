// Shared by every action module in this Function (admin-users.js, event-assignment.js).
// Keep in sync with src/app/data/services/auth.service.ts's ROLE_LABELS — the two run in
// separate deployments (this Function vs. the Angular app) with no shared module system,
// so there's no way to import one list into the other; update both by hand.
export const VALID_ROLES = ['admin', 'operator'];

export function buildClient(ClientCtor, endpoint, projectId) {
  return new ClientCtor().setEndpoint(endpoint).setProject(projectId);
}

/**
 * Verifies the caller via their JWT (never the spoofable x-appwrite-user-id header) —
 * runs before any action-specific payload parsing/validation, so an unauthenticated or
 * non-admin caller always gets 401/403 first, regardless of what action they asked for.
 */
export async function verifyAdminCaller({ req, ClientCtor, AccountCtor, endpoint, projectId, error }) {
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

/**
 * Same JWT verification as verifyAdminCaller, without the admin-only gate — for actions an
 * Operator may legitimately call (e.g. recording a donation). The caller's own role/assignment
 * is then checked by the action itself, against whatever resource it's acting on.
 */
export async function verifyCaller({ req, ClientCtor, AccountCtor, endpoint, projectId, error }) {
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

  return { caller };
}

export const VALID = { valid: true };

export function invalid(error) {
  return { valid: false, body: { error } };
}

export function hasValue(field) {
  return typeof field === 'string' && field.length > 0;
}
