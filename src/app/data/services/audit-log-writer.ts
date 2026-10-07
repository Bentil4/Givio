import { ID, Permission, Role, type Models, type TablesDB } from 'appwrite';
import { environment } from '../../../environments/environment';
import type { AuditAction, AuditEntityType, AuditLogEntry } from '../models/audit-log';
import { ServiceError } from '../../core/services/service-error';
import { appDb } from '../dexie/app-db';

export interface WriteAuditLogInput {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  performedBy: string;
  previousValues: unknown;
  newValues: unknown;
  /** Story 7.5 (FR-15): the Tenant whose data the entry concerns — what a Super Organizer's
   *  listTenantAuditLog filters on. Omitted for a pre-6.2 event with no tenant, which keeps
   *  the entry a platform one (see auditLogReadPermissions). */
  tenantId?: string;
}

/**
 * AD-12 (amended 2026-10-07): a company's entry (one with a tenantId) is readable by nobody
 * client-side — its Super Organizer reads it through the Function's listTenantAuditLog — while
 * a platform entry keeps the Admin Label's read. Keep in sync with the Function's
 * audit-log-grants.js auditLogReadPermissions; the two deployments share no module system.
 */
export function auditLogReadPermissions(tenantId: string | undefined): string[] {
  return tenantId ? [] : [Permission.read(Role.label('admin'))];
}

/**
 * The client half of the audit trail: an Operator's own donation writes (record, dismiss a
 * rejected one). Every other audited change is written by the Function.
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
        ...(entry.tenantId ? { tenantId: entry.tenantId } : {}),
      },
      permissions: auditLogReadPermissions(entry.tenantId),
    });
  } catch (error) {
    throw new ServiceError('Failed to write audit log', error);
  }
}

/**
 * A Donation carries no tenantId of its own — it inherits its Event's, read from the local
 * Dexie copy every Operator screen already holds. A missing Event (or a failed read) just
 * leaves the entry untenanted: the audit write is best-effort and must not fail on this.
 */
export async function tenantIdOfLocalEvent(eventId: string): Promise<string | undefined> {
  try {
    return (await appDb.events.get(eventId))?.tenantId;
  } catch {
    return undefined;
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
