import { ID, Permission, Role, type Models, type TablesDB } from 'appwrite';
import { environment } from '../../../environments/environment';
import type { AuditAction, AuditEntityType, AuditLogEntry } from '../models/audit-log';
import { ServiceError } from './service-error';

export interface WriteAuditLogInput {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  performedBy: string;
  previousValues: unknown;
  newValues: unknown;
}

/**
 * Shared by every DataService that mutates an audited entity (event, donation, ...) — was
 * EventDataService.writeAuditLog, generalized beyond its original entityType:'event'/
 * action:'edit' signature so donation create/edit/soft-delete/recover can log too.
 */
export async function writeAuditLog(databases: TablesDB, entry: WriteAuditLogInput): Promise<void> {
  try {
    await databases.createRow({
      databaseId: environment.appwriteDatabaseId,
      tableId: environment.auditLogsCollectionId,
      rowId: ID.unique(),
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        performedBy: entry.performedBy,
        previousValues: JSON.stringify(entry.previousValues),
        newValues: JSON.stringify(entry.newValues),
        timestamp: new Date().toISOString(),
      },
      permissions: [Permission.read(Role.label('admin'))],
    });
  } catch (error) {
    throw new ServiceError('Failed to write audit log', error);
  }
}

/** previousValues/newValues are stored as JSON strings server-side — parsed back out here. */
export function rowToAuditLogEntry(row: Models.DefaultRow): AuditLogEntry {
  return {
    id: row['$id'],
    entityType: row['entityType'],
    entityId: row['entityId'],
    action: row['action'],
    performedBy: row['performedBy'],
    previousValues: safeJsonParse(row['previousValues']),
    newValues: safeJsonParse(row['newValues']),
    timestamp: row['timestamp'],
  };
}

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
