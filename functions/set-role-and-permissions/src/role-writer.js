import { Client, Account, Users } from 'node-appwrite';

// Keep in sync with src/app/data/stores/auth-store.ts's ROLE_LABELS — the two run in
// separate deployments (this Function vs. the Angular app) with no shared module system,
// so there's no way to import one list into the other; update both by hand.
const VALID_ROLES = ['admin', 'operator'];

function buildClient(ClientCtor, endpoint, projectId) {
  return new ClientCtor().setEndpoint(endpoint).setProject(projectId);
}

/**
 * The sole writer of user role Labels (AD-9). Verifies the caller via their JWT
 * (never the spoofable x-appwrite-user-id header) before validating or acting on
 * anything else in the request — an unauthenticated caller must always get 401,
 * never a 400 that reveals the endpoint validates the body shape first.
 *
 * ClientCtor/AccountCtor/UsersCtor are injectable so tests can substitute fakes
 * without module-mocking node-appwrite.
 */
export async function setRole({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  UsersCtor = Users,
}) {
  const callerJwt = req.headers['x-appwrite-user-jwt'];
  if (!callerJwt) {
    return res.json({ error: 'Unauthenticated' }, 401);
  }

  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;

  const callerClient = buildClient(ClientCtor, endpoint, projectId).setJWT(callerJwt);

  let caller;
  try {
    caller = await new AccountCtor(callerClient).get();
  } catch (err) {
    error(`Caller JWT verification failed: ${err.message}`);
    return res.json({ error: 'Unauthenticated' }, 401);
  }

  if (!(caller.labels ?? []).includes('admin')) {
    return res.json({ error: 'Forbidden' }, 403);
  }

  let body;
  try {
    body = JSON.parse(req.bodyRaw || '{}');
  } catch {
    return res.json({ error: 'Invalid JSON body' }, 400);
  }

  const { userId, role } = body ?? {};

  if (typeof userId !== 'string' || userId.length === 0 || !VALID_ROLES.includes(role)) {
    return res.json({ error: 'Request must include userId and role ("admin" | "operator")' }, 400);
  }

  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error('Missing x-appwrite-key — the Function\'s execution API key scopes are likely misconfigured.');
    return res.json({ error: 'Server misconfiguration: missing execution API key' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);

  try {
    await new UsersCtor(adminClient).updateLabels({ userId, labels: [role] });
  } catch (err) {
    error(`updateLabels failed: ${err.message}`);
    return res.json({ error: 'Failed to update role' }, 502);
  }

  log(`Role for user ${userId} set to "${role}" by admin ${caller.$id}`);
  return res.json({ success: true, userId, role });
}
