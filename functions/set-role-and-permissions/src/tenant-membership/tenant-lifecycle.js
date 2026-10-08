import { hasValue } from '../shared.js';
import { recomputeTenantReadGrants, truncationWarning } from '../tenant-grants.js';
import { alertAdminsOfFailedSweep } from './sweep-alert.js';
import { isTenantIntakeComplete } from './validation.js';
import { auditTenantDecision, decisionFor } from './tenant-decision-audit.js';

// Story 6.2's own scope: Tenant creation itself (the initial 'pending' row at self-signup) is
// Story 6.4's job, not this one — so 'pending' is a starting state this Function reads, never
// a transition target this module writes to. Story 8.1: suspended -> approved is Admin clearing
// an investigation; the grant recompute below restores every Membership's access unchanged.
const ALLOWED_TENANT_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
  suspended: ['approved'],
};

// Statuses whose write is followed by a sweep, so a same-status call means "retry the sweep".
const SWEEP_RETRY_STATUSES = ['approved', 'suspended', 'rejected'];

export async function handleSetTenantStatus(context) {
  const {
    DatabasesCtor,
    adminClient,
    payload,
    databaseId,
    tenantsCollectionId,
    eventsCollectionId,
    membershipsCollectionId,
    error,
  } = context;
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
  // permanently stuck — a same-status transition is never in ALLOWED_TENANT_TRANSITIONS, so
  // the normal check would reject every retry attempt (a reinstatement's included, Story 8.1).
  const isSweepRetry = from === status && SWEEP_RETRY_STATUSES.includes(status);
  if (!isSweepRetry && !(ALLOWED_TENANT_TRANSITIONS[from] ?? []).includes(status)) {
    return {
      status: 400,
      body: { error: `Cannot change tenant status from ${from} to ${status}` },
    };
  }
  if (status === 'approved' && !isTenantIntakeComplete(tenant)) {
    return { status: 409, body: { error: 'Tenant intake is incomplete' } };
  }
  // Story 6.5 (FR-8): the server, not the disabled button, is what makes approval impossible
  // before recordTenantVerification has stamped who verified the application and when.
  if (status === 'approved' && !isTenantVerificationRecorded(tenant)) {
    return {
      status: 409,
      body: { error: 'Record the document review and phone verification before approving' },
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
    // Before the sweep, so a decision is on record even when the sweep below fails and is retried.
    await auditTenantDecision({
      ...context,
      decision: decisionFor({ from, to: status }),
      tenant: { ...tenant, status },
      from,
    });
  }

  // AD-2: approval grants every active organizer-tier member read on the tenant's Events and
  // Donations; suspend/reject removes every Membership-derived grant (Family access is by
  // accessCode, AD-10, and is unaffected). A sweep that leaves any row stale reports 502 — the
  // status is already written, and the same call (or recomputeTenantReadGrants) retries it.
  const grants = await recomputeTenantReadGrants({
    DatabasesCtor,
    adminClient,
    tenantId,
    tenantStatus: status,
    error,
  });
  if (!grants.ok) {
    await alertAdminsOfFailedSweep({ ...context, tenantId, tenantName: tenant.name, grants });
    return {
      status: 502,
      body: {
        error: 'Tenant status was changed, but sweeping its Event permissions failed',
        tenantId,
        status,
        grants,
      },
    };
  }

  return { status: 200, body: { success: true, tenantId, status, ...truncationWarning(grants) } };
}

/**
 * Story 6.5 (FR-8): Admin attests that they reviewed the verification document AND completed
 * the phone call — both in one act, so verifiedBy/verifiedAt only ever mean "both checks done".
 * The first attestation stands: a repeat call returns the existing record rather than
 * re-attributing it to whoever clicked last.
 */
export async function handleRecordTenantVerification(context) {
  const {
    DatabasesCtor,
    StorageCtor,
    adminClient,
    payload,
    caller,
    databaseId,
    tenantsCollectionId,
    documentsBucketId,
    error,
  } = context;
  const { tenantId } = payload;
  const databases = new DatabasesCtor(adminClient);

  let tenant;
  try {
    tenant = await databases.getRow({ databaseId, tableId: tenantsCollectionId, rowId: tenantId });
  } catch (err) {
    error(`recordTenantVerification: tenant ${tenantId} not found: ${err.message}`);
    return { status: 404, body: { error: 'Tenant not found' } };
  }

  if (tenant.status !== 'pending') {
    return { status: 409, body: { error: `Tenant is already ${tenant.status}` } };
  }
  if (isTenantVerificationRecorded(tenant)) {
    return {
      status: 200,
      body: {
        success: true,
        tenantId,
        verifiedBy: tenant.verifiedBy,
        verifiedAt: tenant.verifiedAt,
      },
    };
  }
  if (!isTenantIntakeComplete(tenant)) {
    return { status: 409, body: { error: 'Tenant intake is incomplete' } };
  }

  try {
    await new StorageCtor(adminClient).getFile({
      bucketId: documentsBucketId,
      fileId: tenant.verificationDocumentId,
    });
  } catch (err) {
    error(
      `recordTenantVerification: document ${tenant.verificationDocumentId} not found: ${err.message}`,
    );
    return { status: 409, body: { error: 'The verification document could not be found' } };
  }

  const verifiedAt = new Date().toISOString();
  try {
    await databases.updateRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: tenantId,
      data: { verifiedBy: caller.$id, verifiedAt },
    });
  } catch (err) {
    error(`recordTenantVerification: updateRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to record the verification' } };
  }
  await auditTenantDecision({ ...context, decision: 'verified', tenant, from: tenant.status });

  return { status: 200, body: { success: true, tenantId, verifiedBy: caller.$id, verifiedAt } };
}

function isTenantVerificationRecorded(tenant) {
  return hasValue(tenant?.verifiedBy) && hasValue(tenant?.verifiedAt);
}
