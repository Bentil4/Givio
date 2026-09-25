import { Client, Account, Users, TablesDB, ID, Query, Permission, Role } from 'node-appwrite';
import {
  buildClient,
  verifyAdminCaller,
  VALID,
  invalid,
  hasValue,
  computeEventPermissions,
  listAllRows,
  isConflictError,
} from './shared.js';

const ACTIONS = ['createMembership', 'revokeMembership', 'setTenantStatus'];

const MEMBERSHIP_ROLES = ['super_organizer', 'organizer', 'operator'];

const TENANT_STATUSES = ['approved', 'rejected', 'suspended'];

// Story 6.2's own scope: Tenant creation itself (the initial 'pending' row at self-signup) is
// Story 6.4's job, not this one — so 'pending' is a starting state this Function reads, never
// a transition target this module writes to.
const ALLOWED_TENANT_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
};

const PAYLOAD_VALIDATORS = {
  createMembership: ({ userId, tenantId, role }) => {
    if (!hasValue(userId) || !hasValue(tenantId)) {
      return invalid('Request must include userId and tenantId');
    }
    if (!MEMBERSHIP_ROLES.includes(role)) {
      return invalid(`role must be one of: ${MEMBERSHIP_ROLES.join(', ')}`);
    }
    return VALID;
  },
  revokeMembership: ({ membershipId }) => {
    if (!hasValue(membershipId)) {
      return invalid('Request must include membershipId');
    }
    return VALID;
  },
  setTenantStatus: ({ tenantId, status }) => {
    if (!hasValue(tenantId)) {
      return invalid('Request must include tenantId');
    }
    if (!TENANT_STATUSES.includes(status)) {
      return invalid(`status must be one of: ${TENANT_STATUSES.join(', ')}`);
    }
    return VALID;
  },
};

function validatePayload(action, payload) {
  const validator = PAYLOAD_VALIDATORS[action];
  if (!validator) {
    return invalid(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  return validator(payload ?? {});
}

/**
 * Retracts the derived Role.user() grant for `userIds` from every Event owned by `tenantId`
 * that currently grants at least one of them — called on both a single Membership revoke
 * (userIds = [that one uid]) and a whole-Tenant suspend/reject (userIds = every currently
 * granted uid across the tenant's Events). assignedUserIds itself is left untouched (AD-2:
 * it stays the record of who was assigned; only the *permission grant* is retracted) — only
 * each affected Event's `permissions` are recomputed to drop the swept uid(s).
 */
async function sweepTenantEventPermissions({
  DatabasesCtor,
  adminClient,
  databaseId,
  eventsCollectionId,
  tenantId,
  userIds,
  error,
}) {
  if (userIds.length === 0) {
    return { listed: true };
  }

  const databases = new DatabasesCtor(adminClient);

  let affectedEvents;
  try {
    affectedEvents = await listAllRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: eventsCollectionId,
      queries: [Query.equal('tenantId', [tenantId]), Query.contains('assignedUserIds', userIds)],
    });
  } catch (err) {
    error(`sweepTenantEventPermissions: listRows failed for tenant ${tenantId}: ${err.message}`);
    return { listed: false };
  }

  const sweptUserIds = new Set(userIds);
  for (const event of affectedEvents) {
    const remainingUserIds = (event.assignedUserIds ?? []).filter((uid) => !sweptUserIds.has(uid));
    try {
      await databases.updateRow({
        databaseId,
        tableId: eventsCollectionId,
        rowId: event.$id,
        data: {},
        permissions: computeEventPermissions(remainingUserIds),
      });
    } catch (err) {
      // Best-effort per-event: one failed sweep must not abort the others (a partially-swept
      // tenant is still strictly safer than an unswept one) — surfaced via `error` for
      // operator visibility, per the Architecture Spine's Deferred operations-envelope note.
      // (Deferred, not patched — see Story 6.2's code-review findings: this matches the
      // Architecture Spine's own explicit Deferred note on the AD-9 Function's ops envelope.)
      error(`sweepTenantEventPermissions: updateRow failed for event ${event.$id}: ${err.message}`);
    }
  }

  return { listed: true };
}

async function handleCreateMembership({
  DatabasesCtor,
  UsersCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  error,
}) {
  const { userId, tenantId, role } = payload;
  const databases = new DatabasesCtor(adminClient);

  // Deliberately does NOT require tenant.status === 'approved' — Story 6.4's self-signup flow
  // creates the applicant's own Super Organizer Membership while the Tenant is still
  // 'pending' (the intake step, before Admin's later approval). Existence is still required:
  // a typo'd/garbage tenantId must not create a permanently orphaned Membership.
  try {
    await databases.getRow({ databaseId, tableId: tenantsCollectionId, rowId: tenantId });
  } catch (err) {
    error(`createMembership: tenant ${tenantId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Tenant not found' } };
  }

  // Mirrors rejectNonOperatorIds's existing precedent in event-assignment.js: confirm the
  // target is a real account before writing an association to it.
  try {
    await new UsersCtor(adminClient).get({ userId });
  } catch (err) {
    error(`createMembership: user ${userId} not found: ${err.message}`);
    return { status: 404, body: { error: 'User not found' } };
  }

  // AD-1/FR-4/FR-5's credentials-per-relationship model means one Account never legitimately
  // holds more than one active Membership at a time — Story 6.3's own AC1 states there is "no
  // product surface anywhere that attaches a second tenant's Membership to an existing
  // Account." Enforcing that here (rather than trusting every future caller to check first)
  // is what makes TenantDataService.getMyActiveMembership's "the" active Membership actually
  // well-defined, instead of picking an arbitrary one among duplicates.
  let existingActiveMemberships;
  try {
    existingActiveMemberships = await listAllRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: membershipsCollectionId,
      queries: [Query.equal('userId', [userId]), Query.equal('status', ['active'])],
    });
  } catch (err) {
    error(`createMembership: existing-membership lookup failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to verify existing memberships' } };
  }
  // Not atomic on its own — a concurrent request can pass this same check before either write
  // lands (code review finding). The `userId_unique` index on the memberships table is what
  // actually enforces "at most one Membership row per Account, ever" (per AD-1/FR-4/FR-5); this
  // pre-check just turns the common case into a clean 409 without a wasted createRow attempt.
  if (existingActiveMemberships.length > 0) {
    return { status: 409, body: { error: 'User already holds an active membership' } };
  }

  const now = new Date().toISOString();
  let row;
  try {
    row = await databases.createRow({
      databaseId,
      tableId: membershipsCollectionId,
      rowId: ID.unique(),
      data: { userId, tenantId, role, status: 'active', grantedBy: caller.$id, grantedAt: now },
      permissions: [Permission.read(Role.label('admin')), Permission.read(Role.user(userId))],
    });
  } catch (err) {
    if (isConflictError(err)) {
      error(`createMembership: userId_unique conflict for ${userId}: ${err.message}`);
      return { status: 409, body: { error: 'User already holds an active membership' } };
    }
    error(`createMembership: createRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to create membership' } };
  }

  return {
    status: 200,
    body: { success: true, membershipId: row.$id, userId, tenantId, role, status: 'active' },
  };
}

async function handleRevokeMembership({
  DatabasesCtor,
  adminClient,
  payload,
  databaseId,
  membershipsCollectionId,
  eventsCollectionId,
  error,
}) {
  const { membershipId } = payload;
  const databases = new DatabasesCtor(adminClient);

  let membership;
  try {
    membership = await databases.getRow({
      databaseId,
      tableId: membershipsCollectionId,
      rowId: membershipId,
    });
  } catch (err) {
    error(`revokeMembership: membership ${membershipId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Membership not found' } };
  }

  try {
    await databases.updateRow({
      databaseId,
      tableId: membershipsCollectionId,
      rowId: membershipId,
      data: { status: 'revoked' },
    });
  } catch (err) {
    error(`revokeMembership: updateRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to revoke membership' } };
  }

  const sweepResult = await sweepTenantEventPermissions({
    DatabasesCtor,
    adminClient,
    databaseId,
    eventsCollectionId,
    tenantId: membership.tenantId,
    userIds: [membership.userId],
    error,
  });
  if (!sweepResult.listed) {
    // Same fail-closed reasoning as setTenantStatus: the Membership row is already revoked,
    // but the Event-permission sweep couldn't even be attempted — say so rather than 200.
    return {
      status: 502,
      body: {
        error: 'Membership was revoked, but sweeping its Event permissions failed',
        membershipId,
      },
    };
  }

  return { status: 200, body: { success: true, membershipId, status: 'revoked' } };
}

async function handleSetTenantStatus({
  DatabasesCtor,
  adminClient,
  payload,
  databaseId,
  tenantsCollectionId,
  eventsCollectionId,
  membershipsCollectionId,
  error,
}) {
  const { tenantId, status } = payload;
  const databases = new DatabasesCtor(adminClient);

  let tenant;
  try {
    tenant = await databases.getRow({ databaseId, tableId: tenantsCollectionId, rowId: tenantId });
  } catch (err) {
    error(`setTenantStatus: tenant ${tenantId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Tenant not found' } };
  }

  const from = tenant.status;
  // A same-status call to a terminal, sweep-bearing status is treated as "retry the sweep",
  // not an illegal no-op transition (code review finding): without this, a tenant whose status
  // write succeeded but whose event sweep then failed (the 502 case below) would be
  // permanently stuck — ALLOWED_TENANT_TRANSITIONS has no outgoing entry for 'suspended' or
  // 'rejected', so the normal transition check would reject every retry attempt.
  const isSweepRetry = from === status && (status === 'suspended' || status === 'rejected');
  if (!isSweepRetry && !(ALLOWED_TENANT_TRANSITIONS[from] ?? []).includes(status)) {
    return {
      status: 400,
      body: { error: `Cannot change tenant status from ${from} to ${status}` },
    };
  }

  if (!isSweepRetry) {
    try {
      await databases.updateRow({
        databaseId,
        tableId: tenantsCollectionId,
        rowId: tenantId,
        data: { status },
      });
    } catch (err) {
      error(`setTenantStatus: updateRow failed: ${err.message}`);
      return { status: 502, body: { error: 'Failed to change the tenant status' } };
    }
  }

  if (status === 'suspended' || status === 'rejected') {
    // Every one of this tenant's Events loses every currently-granted uid — not a
    // targeted-by-uid sweep (that's sweepTenantEventPermissions's job for a single
    // Membership revoke), so this lists and clears the tenant's Events directly rather than
    // computing a uid list and re-querying by it (avoids a redundant round trip, and means
    // there is exactly one place this can fail, not two).
    let tenantEvents;
    try {
      tenantEvents = await listAllRows({
        DatabasesCtor,
        adminClient,
        databaseId,
        tableId: eventsCollectionId,
        queries: [Query.equal('tenantId', [tenantId])],
      });
    } catch (err) {
      error(`setTenantStatus: listing tenant's events failed: ${err.message}`);
      // Story 6.2 code review (fail-closed, not fail-open): the tenant's status row was
      // already written above, but the sweep could not even be attempted — report that
      // honestly rather than a 200 that implies every Event grant was revoked.
      return {
        status: 502,
        body: {
          error: 'Tenant status was changed, but sweeping its Event permissions failed',
          tenantId,
          status,
        },
      };
    }

    for (const event of tenantEvents) {
      try {
        await databases.updateRow({
          databaseId,
          tableId: eventsCollectionId,
          rowId: event.$id,
          data: {},
          permissions: computeEventPermissions([]),
        });
      } catch (err) {
        // Deferred, not patched — matches sweepTenantEventPermissions's own per-event
        // best-effort behavior and the Architecture Spine's Deferred ops-envelope note.
        error(`setTenantStatus: updateRow failed for event ${event.$id}: ${err.message}`);
      }
    }
  }

  return { status: 200, body: { success: true, tenantId, status } };
}

/**
 * Story 6.2 (AD-1/AD-9 amended): the sole writer of Memberships and Tenant status transitions.
 * Every action here is Admin-caller-gated for this story — Epic 7 layers an Organizer-caller
 * (FR-11's super_organizer-only gate) plus IdentityFlags cross-referencing (FR-12/FR-23) on
 * top of createMembership later; that gating is deliberately not built here (see Story 6.2 Dev
 * Notes, "Known interim gap").
 *
 * ClientCtor/AccountCtor/DatabasesCtor are injectable so tests can substitute fakes without
 * module-mocking node-appwrite.
 */
export async function handleTenantMembershipRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  UsersCtor = Users,
  DatabasesCtor = TablesDB,
}) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const databaseId = process.env.APPWRITE_DATABASE_ID;
  const eventsCollectionId = process.env.APPWRITE_EVENTS_COLLECTION_ID;
  const tenantsCollectionId = process.env.APPWRITE_TENANTS_COLLECTION_ID;
  const membershipsCollectionId = process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID;

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

  const validation = validatePayload(action, payload);
  if (!validation.valid) {
    return res.json(validation.body, 400);
  }

  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey) {
    error(
      "Missing x-appwrite-key — the Function's execution API key scopes are likely misconfigured.",
    );
    return res.json({ error: 'Server misconfiguration: missing execution API key' }, 500);
  }

  if (
    !hasValue(databaseId) ||
    !hasValue(eventsCollectionId) ||
    !hasValue(tenantsCollectionId) ||
    !hasValue(membershipsCollectionId)
  ) {
    error(
      'Missing APPWRITE_DATABASE_ID/APPWRITE_EVENTS_COLLECTION_ID/APPWRITE_TENANTS_COLLECTION_ID/APPWRITE_MEMBERSHIPS_COLLECTION_ID function variables.',
    );
    return res.json({ error: 'Server misconfiguration: missing database/collection ID' }, 500);
  }

  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);
  const actionContext = {
    DatabasesCtor,
    UsersCtor,
    adminClient,
    payload,
    caller,
    databaseId,
    eventsCollectionId,
    tenantsCollectionId,
    membershipsCollectionId,
    error,
  };

  let result;
  switch (action) {
    case 'createMembership':
      result = await handleCreateMembership(actionContext);
      break;
    case 'revokeMembership':
      result = await handleRevokeMembership(actionContext);
      break;
    case 'setTenantStatus':
      result = await handleSetTenantStatus(actionContext);
      break;
  }

  if (result.status === 200) {
    log(`${action} succeeded (by admin ${caller.$id}): ${JSON.stringify(result.body)}`);
  }
  return res.json(result.body, result.status);
}

export { ACTIONS as TENANT_MEMBERSHIP_ACTIONS };
