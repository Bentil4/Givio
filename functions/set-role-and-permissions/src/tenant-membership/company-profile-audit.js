import { writeTenantAuditLog } from '../tenant-events/event-audit.js';

const TEXT_FIELDS = ['name', 'location', 'contactPhone'];

/**
 * What a profile save changed, as the before/after pair the audit trail stores — only the
 * fields that differ, so a save that changes nothing leaves no entry (`null`). The logo is an
 * image data URL, far larger than an audit value may be, so only its state is recorded.
 */
export function profileChange({ before, after }) {
  const previousValues = {};
  const newValues = {};
  for (const field of TEXT_FIELDS) {
    if ((before[field] ?? null) !== (after[field] ?? null)) {
      previousValues[field] = before[field] ?? null;
      newValues[field] = after[field] ?? null;
    }
  }
  recordLogoChange({ before, after, previousValues, newValues });
  return Object.keys(newValues).length > 0 ? { previousValues, newValues } : null;
}

function recordLogoChange({ before, after, previousValues, newValues }) {
  if ((before.logo ?? null) === (after.logo ?? null)) {
    return;
  }
  previousValues.logo = before.logo ? 'set' : 'none';
  newValues.logo = !after.logo ? 'none' : before.logo ? 'replaced' : 'set';
}

/** Best-effort: the profile is already saved, so a failed audit write never fails the save. */
export async function auditProfileChange({ change, tenantId, caller, ...context }) {
  if (!change) {
    return false;
  }
  return writeTenantAuditLog({
    ...context,
    entry: {
      entityType: 'tenant',
      entityId: tenantId,
      action: 'edit',
      performedBy: caller.$id,
      previousValues: change.previousValues,
      newValues: { ...change.newValues, tenantId },
    },
  });
}
