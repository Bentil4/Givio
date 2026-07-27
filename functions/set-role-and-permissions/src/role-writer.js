import { Client, Account, Users } from 'node-appwrite';

const VALID_ROLES = ['admin', 'operator'];

/**
 * The sole writer of user role Labels (AD-9). Verifies the caller via their JWT
 * (never the spoofable x-appwrite-user-id header) before writing anything.
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

  const callerJwt = req.headers['x-appwrite-user-jwt'];
  if (!callerJwt) {
    return res.json({ error: 'Unauthenticated' }, 401);
  }

  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;

  const callerClient = new ClientCtor().setEndpoint(endpoint).setProject(projectId).setJWT(callerJwt);

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

  const dynamicKey = req.headers['x-appwrite-key'] ?? '';
  const adminClient = new ClientCtor().setEndpoint(endpoint).setProject(projectId).setKey(dynamicKey);

  try {
    await new UsersCtor(adminClient).updateLabels({ userId, labels: [role] });
  } catch (err) {
    error(`updateLabels failed: ${err.message}`);
    return res.json({ error: 'Failed to update role' }, 502);
  }

  log(`Role for user ${userId} set to "${role}" by admin ${caller.$id}`);
  return res.json({ success: true, userId, role });
}
