import { writeTenantAuditLog } from '../tenant-events/event-audit.js';

/** What an Admin decided, from the status the company moved between. */
const DECISIONS = {
  'pending>approved': 'approved',
  'pending>rejected': 'rejected',
  'approved>suspended': 'suspended',
  'suspended>approved': 'reinstated',
};

export function decisionFor({ from, to }) {
  return DECISIONS[`${from}>${to}`] ?? null;
}

/**
 * An Admin's decision on a company, for the platform audit trail. It carries no `tenantId` on
 * purpose: a company's own entries are hidden from Admins (AD-12), but this is the Admin's own
 * action, so it stays a platform entry they can read — and the company's Activity log, which
 * lists only entries stamped with its tenantId, never shows it.
 * Best-effort: the decision is already made, so a failed audit write never undoes it.
 */
export async function auditTenantDecision({ decision, tenant, from, caller, ...context }) {
  if (!decision) {
    return false;
  }
  return writeTenantAuditLog({
    ...context,
    entry: {
      entityType: 'tenant',
      entityId: tenant.$id,
      action: 'edit',
      performedBy: caller.$id,
      previousValues: { status: from },
      newValues: { decision, status: tenant.status, tenantName: tenant.name ?? null },
    },
  });
}
