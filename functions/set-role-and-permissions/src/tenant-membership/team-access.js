import { Query, Permission, Role } from 'node-appwrite';
import { hasValue, listAllRows } from '../shared.js';

// Which roles each Organizer-tier caller may add or revoke. super_organizer is never a target:
// a Tenant has exactly one, created by inviteOrganizer/submitTenantApplication.
const TEAM_MANAGEABLE_ROLES = {
  super_organizer: ['organizer', 'operator'],
  organizer: ['operator'],
};
export const ORGANIZER_TIER_ROLES = ['super_organizer', 'organizer'];

/**
 * Story 7.1: resolves which Tenant a team action applies to and in what capacity. Admin acts on
 * the payload's tenantId with full access (`callerRole: null`). Anyone else must hold an active
 * super_organizer/organizer Membership in an approved Tenant — the same FR-9 boundary as
 * shared.js's rejectUnapprovedTenantMember, except that having no Membership at all is refused
 * rather than waved through — and the Tenant is always that Membership's, never the client's:
 * a supplied tenantId that differs is refused. Returns `{ tenantId, callerRole, tenant? }` or
 * `{ errorResponse }`.
 */
export async function resolveTeamScope({
  DatabasesCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  error,
}) {
  if (isAdminCaller(caller)) {
    return { tenantId: payload.tenantId, callerRole: null };
  }

  const forbidden = { errorResponse: { status: 403, body: { error: 'Forbidden' } } };
  const databases = new DatabasesCtor(adminClient);
  let membership;
  let tenant;
  try {
    const { rows } = await databases.listRows({
      databaseId,
      tableId: membershipsCollectionId,
      queries: [Query.equal('userId', [caller.$id]), Query.limit(1)],
    });
    membership = rows[0];
    if (
      !membership ||
      membership.status !== 'active' ||
      !ORGANIZER_TIER_ROLES.includes(membership.role)
    ) {
      return forbidden;
    }
    tenant = await databases.getRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: membership.tenantId,
    });
  } catch (err) {
    error(`resolveTeamScope: lookup failed for ${caller.$id}: ${err.message}`);
    return { errorResponse: { status: 502, body: { error: 'Failed to verify team access' } } };
  }

  if (tenant.status !== 'approved') {
    return forbidden;
  }
  if (hasValue(payload.tenantId) && payload.tenantId !== membership.tenantId) {
    return forbidden;
  }
  return {
    tenantId: membership.tenantId,
    callerRole: membership.role,
    tenant,
  };
}

export function isAdminCaller(caller) {
  return (caller.labels ?? []).includes('admin');
}

export function canManageRole(callerRole, targetRole) {
  return callerRole === null || (TEAM_MANAGEABLE_ROLES[callerRole] ?? []).includes(targetRole);
}

/**
 * The Tenant row's read grants, derived from data (AD-2's rule, applied to the Tenant row):
 * Admin plus every active Organizer-tier Membership of that Tenant. Recomputed whenever such a
 * Membership is added or revoked, so concurrent team changes can't clobber each other's grant.
 * Operators get none — they work in /organizer and never read the Tenant row.
 */
export async function syncTenantReadGrants({
  DatabasesCtor,
  adminClient,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  tenantId,
}) {
  const members = await listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId,
    tableId: membershipsCollectionId,
    queries: [Query.equal('tenantId', [tenantId]), Query.equal('status', ['active'])],
  });
  const readers = [
    ...new Set(members.filter((m) => ORGANIZER_TIER_ROLES.includes(m.role)).map((m) => m.userId)),
  ];
  await new DatabasesCtor(adminClient).updateRow({
    databaseId,
    tableId: tenantsCollectionId,
    rowId: tenantId,
    data: {},
    permissions: [
      Permission.read(Role.label('admin')),
      ...readers.map((uid) => Permission.read(Role.user(uid))),
    ],
  });
}

/**
 * Operators still sign in through the Label-gated /organizer tier (Story 6.2's known interim
 * gap), so an Operator added here needs the `operator` Label too, and loses it again on
 * revoke.
 */
export async function setOperatorLabel({ UsersCtor, adminClient, userId, enabled }) {
  const users = new UsersCtor(adminClient);
  if (enabled) {
    await users.updateLabels({ userId, labels: ['operator'] });
    return;
  }
  const account = await users.get({ userId });
  await users.updateLabels({
    userId,
    labels: (account.labels ?? []).filter((label) => label !== 'operator'),
  });
}
