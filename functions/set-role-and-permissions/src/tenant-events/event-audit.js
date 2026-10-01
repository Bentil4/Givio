import { ID, Permission, Role } from 'node-appwrite';
import { hasValue } from '../shared.js';

/**
 * Story 6.7: the server-side twin of the app's audit-log-writer.ts, same row shape (entityType
 * `event`, before/after values as JSON strings, performer, timestamp). It runs here because an
 * Organizer-tier Account carries no Label and audit_logs only grants create to the admin and
 * operator Labels — and a Function-written entry can't be skipped or forged by the client.
 * Best-effort like the Admin path: the Event write has already happened, so a failed audit
 * write is logged, never turned into a failed action. Returns whether the entry was written.
 */
export async function writeEventAuditLog({ DatabasesCtor, adminClient, entry, error }) {
  const tableId = process.env.APPWRITE_AUDIT_LOGS_COLLECTION_ID;
  if (!hasValue(tableId)) {
    error('writeEventAuditLog: APPWRITE_AUDIT_LOGS_COLLECTION_ID is not configured');
    return false;
  }
  try {
    await new DatabasesCtor(adminClient).createRow({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId,
      rowId: ID.unique(),
      data: auditRowData(entry),
      permissions: [Permission.read(Role.label('admin'))],
    });
    return true;
  } catch (err) {
    error(`writeEventAuditLog: ${entry.action} on event ${entry.eventId} failed: ${err.message}`);
    return false;
  }
}

function auditRowData({ eventId, action, performedBy, previousValues, newValues }) {
  return {
    entityType: 'event',
    entityId: eventId,
    action,
    performedBy,
    previousValues: JSON.stringify(previousValues),
    newValues: JSON.stringify(newValues),
    timestamp: new Date().toISOString(),
  };
}
