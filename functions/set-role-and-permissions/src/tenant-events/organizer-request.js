import { buildClient, verifyCaller, hasValue, invalid } from '../shared.js';

/**
 * The common front half of an Organizer-tier request (tenant-events.js, tenant-donations.js):
 * verify the caller, refuse any labelled Account, validate the action's payload, then check the
 * Function's own configuration. Resolves to `{ action, payload, caller, adminClient }` or
 * `{ errorResponse }`. The Tenant itself is resolved later, per action, from the Membership.
 * Expects `{ req, ClientCtor, AccountCtor, error, validators, tableIds }`.
 */
export async function prepareOrganizerRequest(options) {
  const { req, ClientCtor, AccountCtor, error } = options;
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const verified = await verifyCaller({ req, ClientCtor, AccountCtor, endpoint, projectId, error });
  if (verified.errorResponse) {
    return verified;
  }
  // Organizer-tier Accounts carry no Label; anyone labelled (Admin keeps its own paths) is
  // refused before the payload is even read, like every other caller gate in this Function.
  if ((verified.caller.labels ?? []).length > 0) {
    return { errorResponse: { status: 403, body: { error: 'Forbidden' } } };
  }
  const parsed = parseAndValidate(req.bodyRaw, options.validators);
  if (parsed.errorResponse) {
    return parsed;
  }
  const keyCheck = requireServerConfig(options);
  if (keyCheck.errorResponse) {
    return keyCheck;
  }
  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(keyCheck.dynamicKey);
  return { ...parsed, caller: verified.caller, adminClient };
}

function parseAndValidate(bodyRaw, validators) {
  let body;
  try {
    body = JSON.parse(bodyRaw || '{}');
  } catch {
    return badRequest({ error: 'Invalid JSON body' });
  }
  const { action, ...payload } = body ?? {};
  const validator = validators[action];
  const validation = validator
    ? validator(payload)
    : invalid(`action must be one of: ${Object.keys(validators).join(', ')}`);
  return validation.valid ? { action, payload } : badRequest(validation.body);
}

function badRequest(body) {
  return { errorResponse: { status: 400, body } };
}

function requireServerConfig({ req, error, tableIds }) {
  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error("Missing x-appwrite-key — the Function's execution API key scopes are misconfigured.");
    return serverMisconfigured('missing execution API key');
  }
  if (!tableIds.every(hasValue)) {
    error('Missing database/table function variables.');
    return serverMisconfigured('missing database/table ID');
  }
  return { dynamicKey };
}

function serverMisconfigured(reason) {
  return { errorResponse: { status: 500, body: { error: `Server misconfiguration: ${reason}` } } };
}
