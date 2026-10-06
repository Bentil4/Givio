import { Query } from 'node-appwrite';
import { listAllRows } from '../shared.js';
import { handleSetTenantStatus } from './tenant-lifecycle.js';
import { revokeTenantMemberSessions } from './session-revocation.js';
import { syncTenantReadGrants } from './team-access.js';

// Story 8.1 (FR-19): Admin's standing actions on a whole tenant account, plus the one read a
// tenant's own member may make about it (getMyTenantStatus, Story 9.2 AC3).

const DESIGNATABLE_ROLES = ['organizer', 'super_organizer'];
const DESIGNATABLE_TENANT_STATUSES = ['approved', 'suspended'];

/**
 * Suspends the tenant and cuts every member off in one call: the status write and Event/
 * Donation grant sweep (setTenantStatus), then every member's sessions. Success is reported
 * only when both the sweep and the sign-out are confirmed; anything less is a 502 carrying
 * both reports, and the same call is the retry (a suspended tenant re-runs both steps).
 */
export async function handleSuspendTenant(context) {
  const { tenantId } = context.payload;
  const statusResult = await handleSetTenantStatus({
    ...context,
    payload: { tenantId, status: 'suspended' },
  });
  if (statusResult.body?.status !== 'suspended') {
    return statusResult;
  }
  const sessions = await revokeTenantMemberSessions({ ...context, tenantId });
  if (statusResult.status !== 200 || !sessions.ok) {
    return suspensionFailure({ statusResult, sessions, tenantId });
  }
  return {
    status: 200,
    body: { ...statusResult.body, membersSignedOut: sessions.membersSignedOut },
  };
}

function suspensionFailure({ statusResult, sessions, tenantId }) {
  const error =
    statusResult.status !== 200
      ? statusResult.body.error
      : 'Tenant was suspended, but signing its members out failed';
  return {
    status: 502,
    body: { error, tenantId, status: 'suspended', grants: statusResult.body.grants, sessions },
  };
}

/**
 * Admin makes an existing active Organizer the tenant's Super Organizer, so a tenant whose sole
 * Super Organizer was revoked is never left without one (Story 8.1). A newly added person is
 * added as an Organizer first (addTeamMember), then designated. Refused while another active
 * Super Organizer exists — a tenant has exactly one. Safe to re-run after a partial failure.
 */
export async function handleDesignateSuperOrganizer(context) {
  const loaded = await loadDesignation(context);
  if (loaded.errorResponse) {
    return loaded.errorResponse;
  }
  const refusal = designationRefusal(loaded);
  if (refusal) {
    return { status: 409, body: { error: refusal } };
  }
  return writeDesignation({ ...context, ...loaded });
}

async function loadDesignation(context) {
  const rows = await loadDesignationRows(context);
  if (rows.errorResponse) {
    return rows;
  }
  const tenantId = rows.tenant.$id;
  try {
    const superOrganizers = await listActiveSuperOrganizers({ ...context, tenantId });
    return { ...rows, superOrganizers };
  } catch (err) {
    context.error(`designateSuperOrganizer: listing ${tenantId}'s members failed: ${err.message}`);
    return { errorResponse: { status: 502, body: { error: 'Failed to load the team' } } };
  }
}

async function loadDesignationRows({
  DatabasesCtor,
  adminClient,
  payload,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
}) {
  const databases = new DatabasesCtor(adminClient);
  const tenant = await findRow({
    databases,
    databaseId,
    tableId: tenantsCollectionId,
    rowId: payload.tenantId,
  });
  if (!tenant) {
    return notFound('Tenant not found');
  }
  const membership = await findRow({
    databases,
    databaseId,
    tableId: membershipsCollectionId,
    rowId: payload.membershipId,
  });
  // Another tenant's Membership looks exactly like a missing one.
  return membership?.tenantId === tenant.$id
    ? { tenant, membership }
    : notFound('Membership not found');
}

function notFound(message) {
  return { errorResponse: { status: 404, body: { error: message } } };
}

async function findRow({ databases, databaseId, tableId, rowId }) {
  try {
    return await databases.getRow({ databaseId, tableId, rowId });
  } catch {
    return null;
  }
}

function listActiveSuperOrganizers({
  DatabasesCtor,
  adminClient,
  databaseId,
  membershipsCollectionId,
  tenantId,
}) {
  return listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId,
    tableId: membershipsCollectionId,
    queries: [
      Query.equal('tenantId', [tenantId]),
      Query.equal('status', ['active']),
      Query.equal('role', ['super_organizer']),
    ],
  });
}

function designationRefusal({ tenant, membership, superOrganizers }) {
  if (!DESIGNATABLE_TENANT_STATUSES.includes(tenant.status)) {
    return `A ${tenant.status} tenant's Super Organizer can't be changed`;
  }
  if (membership.status !== 'active') {
    return 'Only an active member can be designated';
  }
  if (!DESIGNATABLE_ROLES.includes(membership.role)) {
    return 'Only an Organizer can be designated — add them as an Organizer first';
  }
  const others = superOrganizers.filter((m) => m.$id !== membership.$id);
  return others.length > 0 ? 'This tenant already has an active Super Organizer' : null;
}

async function writeDesignation(context) {
  const { DatabasesCtor, adminClient, databaseId, tenant, membership, error } = context;
  const databases = new DatabasesCtor(adminClient);
  try {
    await databases.updateRow({
      databaseId,
      tableId: context.membershipsCollectionId,
      rowId: membership.$id,
      data: { role: 'super_organizer' },
    });
    await databases.updateRow({
      databaseId,
      tableId: context.tenantsCollectionId,
      rowId: tenant.$id,
      data: { superOrganizerId: membership.userId },
    });
    await syncTenantReadGrants({ ...context, tenantId: tenant.$id });
  } catch (err) {
    error(`designateSuperOrganizer: writing ${membership.$id} failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to designate the Super Organizer' } };
  }
  return {
    status: 200,
    body: {
      success: true,
      tenantId: tenant.$id,
      membershipId: membership.$id,
      superOrganizerId: membership.userId,
    },
  };
}

/**
 * Story 9.2 AC3: the caller's own tenant status, for the client to route a suspended tenant's
 * member to a clear message — Operators can't read their Tenant row. Also returns that tenant's
 * name and logo so its members see whom they work for. Discloses nothing beyond the caller's
 * own active Membership's tenant; every field is `null` when there is none.
 */
export async function handleGetMyTenantStatus(context) {
  const { DatabasesCtor, adminClient, caller, databaseId, error } = context;
  const databases = new DatabasesCtor(adminClient);
  try {
    const { rows } = await databases.listRows({
      databaseId,
      tableId: context.membershipsCollectionId,
      queries: [Query.equal('userId', [caller.$id]), Query.limit(1)],
    });
    const tenant = await activeMembershipTenant({ databases, context, membership: rows[0] });
    return { status: 200, body: { success: true, ...ownTenantIdentity(tenant) } };
  } catch (err) {
    error(`getMyTenantStatus: lookup failed for ${caller.$id}: ${err.message}`);
    return { status: 502, body: { error: 'Failed to check your company status' } };
  }
}

async function activeMembershipTenant({ databases, context, membership }) {
  if (membership?.status !== 'active') {
    return null;
  }
  return databases.getRow({
    databaseId: context.databaseId,
    tableId: context.tenantsCollectionId,
    rowId: membership.tenantId,
  });
}

function ownTenantIdentity(tenant) {
  return {
    tenantStatus: tenant?.status ?? null,
    tenantName: tenant?.name ?? null,
    logo: tenant?.logo ?? null,
  };
}
