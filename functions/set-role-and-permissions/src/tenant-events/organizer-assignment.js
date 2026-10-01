import { Query } from 'node-appwrite';
import { listAllRows } from '../shared.js';
import { recomputeEventReadGrants } from '../tenant-grants.js';
import { authorizeOrganizerEventAccess } from './organizer-scope.js';
import { writeEventAuditLog } from './event-audit.js';

/**
 * Story 6.7: assignOperators for an Organizer-tier caller, reached from event-assignment.js.
 * The Event must be their own Tenant's and every assigned uid an active Operator Membership of
 * that same Tenant — never another company's people, never a legacy Label-only Operator. The
 * write itself is the Admin path's AD-2 recompute; the change is audit-logged server-side.
 */
export async function assignOperatorsAsOrganizer(context) {
  const access = await authorizeOrganizerEventAccess({
    ...context,
    eventId: context.payload.eventId,
  });
  if (access.errorResponse) {
    return access.errorResponse;
  }
  const rejection = await rejectOutsideOperators({ ...context, tenantId: access.tenantId });
  return rejection ?? saveAssignment({ ...context, event: access.event });
}

async function rejectOutsideOperators({ DatabasesCtor, adminClient, payload, tenantId, error }) {
  let operatorIds;
  try {
    operatorIds = await activeOperatorIds({ DatabasesCtor, adminClient, tenantId });
  } catch (err) {
    error(`assignOperators: operator lookup for tenant ${tenantId} failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to verify your Operators' } };
  }
  const outsider = payload.assignedUserIds.find((userId) => !operatorIds.has(userId));
  return outsider === undefined
    ? null
    : { status: 400, body: { error: `User ${outsider} is not an Operator in your company` } };
}

async function activeOperatorIds({ DatabasesCtor, adminClient, tenantId }) {
  const memberships = await listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId: process.env.APPWRITE_DATABASE_ID,
    tableId: process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID,
    queries: [Query.equal('tenantId', [tenantId]), Query.equal('status', ['active'])],
  });
  // Re-checked in memory so a query filter that didn't apply can never widen who is assignable.
  const operators = memberships.filter(
    (m) => m.tenantId === tenantId && m.status === 'active' && m.role === 'operator',
  );
  return new Set(operators.map((m) => m.userId));
}

async function saveAssignment({ DatabasesCtor, adminClient, payload, event, caller, log, error }) {
  const { eventId, assignedUserIds } = payload;
  const previousAssignedUserIds = event.assignedUserIds ?? [];
  const grants = await recomputeEventReadGrants({
    DatabasesCtor,
    adminClient,
    event: { ...event, assignedUserIds },
    data: { assignedUserIds },
    error,
  });
  if (!grants.ok) {
    return { status: 502, body: { error: 'Failed to save operator assignment', grants } };
  }
  await writeEventAuditLog({
    DatabasesCtor,
    adminClient,
    entry: {
      eventId,
      action: 'edit',
      performedBy: caller.$id,
      previousValues: { assignedUserIds: previousAssignedUserIds },
      newValues: { assignedUserIds, tenantId: event.tenantId },
    },
    error,
  });
  log(`assignOperators succeeded (by organizer ${caller.$id}): ${eventId}`);
  return { status: 200, body: { success: true, eventId, assignedUserIds } };
}
