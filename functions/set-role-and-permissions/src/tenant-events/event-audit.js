import { ID } from 'node-appwrite';
import { hasValue } from '../shared.js';
import { auditLogReadPermissions } from '../audit-log-grants.js';

/**
 * Story 6.7: the server-side twin of the app's audit-log-writer.ts, same row shape (entityType
 * `event`, before/after values as JSON strings, performer, timestamp). It runs here because an
 * Organizer-tier Account carries no Label and audit_logs only grants create to the admin and
 * operator Labels — and a Function-written entry can't be skipped or forged by the client.
 * Best-effort like the Admin path: the Event write has already happened, so a failed audit
 * write is logged, never turned into a failed action. Returns whether the entry was written.
 * Story 7.5: every caller already stamps the Event's tenantId into newValues; it is lifted into
 * the row's own tenantId column too, which is what listTenantAuditLog filters on (FR-15).
 * AD-12 (amended 2026-10-07): a company entry carries no Admin read — see auditLogReadPermissions.
 */
export function writeEventAuditLog({ entry, ...context }) {
  const { eventId, ...rest } = entry;
  return writeTenantAuditLog({
    ...context,
    entry: { entityType: 'event', entityId: eventId, ...rest },
  });
}

/** The same entry for any audited entity — a Super Organizer's donation corrections too. */
export async function writeTenantAuditLog({ DatabasesCtor, adminClient, entry, error }) {
  const tableId = process.env.APPWRITE_AUDIT_LOGS_COLLECTION_ID;
  if (!hasValue(tableId)) {
    error('writeTenantAuditLog: APPWRITE_AUDIT_LOGS_COLLECTION_ID is not configured');
    return false;
  }
  try {
    await new DatabasesCtor(adminClient).createRow({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId,
      rowId: ID.unique(),
      data: auditRowData(entry),
      permissions: auditLogReadPermissions(entry.newValues.tenantId),
    });
    return true;
  } catch (err) {
    error(
      `writeTenantAuditLog: ${entry.action} on ${entry.entityType} ${entry.entityId} failed: ` +
        err.message,
    );
    return false;
  }
}

function auditRowData({ entityType, entityId, action, performedBy, previousValues, newValues }) {
  return {
    entityType,
    entityId,
    action,
    performedBy,
    previousValues: JSON.stringify(previousValues),
    newValues: JSON.stringify(newValues),
    ...(hasValue(newValues.tenantId) ? { tenantId: newValues.tenantId } : {}),
    timestamp: new Date().toISOString(),
  };
}
