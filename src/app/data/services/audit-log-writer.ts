import { ID, Permission, Role, type Models, type TablesDB } from 'appwrite';
import { environment } from '../../../environments/environment';
import type {
  AccessLogDetails,
  AuditAction,
  AuditEntityType,
  AuditLogEntry,
} from '../models/audit-log';
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
   *  listTenantAuditLog filters on. Omitted for a pre-6.2 event with no tenant, and for Admin
   *  'access' reads, so neither appears in any tenant's view (both stay in admin-audit). */
  tenantId?: string;
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
        ...(entry.tenantId ? { tenantId: entry.tenantId } : {}),
      },
      permissions: [Permission.read(Role.label('admin'))],
    });
  } catch (error) {
    throw new ServiceError('Failed to write audit log', error);
  }
}

/**
 * A Donation carries no tenantId of its own — it inherits its Event's, read from the local
 * Dexie copy every Operator/Admin screen already holds. A missing Event (or a failed read) just
 * leaves the entry untenanted: the audit write is best-effort and must not fail on this.
 */
export async function tenantIdOfLocalEvent(eventId: string): Promise<string | undefined> {
  try {
    return (await appDb.events.get(eventId))?.tenantId;
  } catch {
    return undefined;
  }
}

/** entityId for an 'access' entry whose read wasn't scoped to one record (a platform-wide list). */
export const ALL_ROWS_ENTITY_ID = '*';

/** Pre-6.2 events carry no tenantId — they're left out of the set rather than recorded as null. */
export function distinctTenantIds(events: readonly { tenantId?: string }[]): string[] {
  return [...new Set(events.flatMap((e) => (e.tenantId ? [e.tenantId] : [])))].sort();
}

/**
 * Story 8.2 (AD-12, FR-19): records an Admin's read of Event/Donation data — one entry per
 * Data-layer method invocation, never per row, and never coalesced by the caller. Checks the
 * `admin` Label directly rather than AuthService.role(), so Super Admin (who holds `admin` too,
 * AD-11) is covered however role precedence ends up ordered; Operators never log reads.
 *
 * Client-side and fire-and-forget by design: this is a best-effort accountability trail, not a
 * tamper-proof one — Admin already has unrestricted read access (AD-2), and a Function-proxied
 * read path was deliberately rejected (AD-12). So it is never awaited, and a failed write
 * (offline, schema not yet migrated, permission error) is swallowed to the console: it must
 * never fail or delay the read it describes. `details` is resolved lazily for the same reason —
 * any extra local lookup it needs happens after the read has already returned.
 */
export function logAdminAccess(databases: TablesDB, access: AdminAccessLogInput): void {
  const { user } = access;
  if (!user?.labels?.includes('admin')) return;
  void writeAdminAccessEntry(databases, user.$id, access);
}

export interface AdminAccessLogInput {
  user: Models.User<Models.Preferences> | null;
  target: { entityType: AuditEntityType; entityId: string };
  details: () => AccessLogDetails | Promise<AccessLogDetails>;
}

async function writeAdminAccessEntry(
  databases: TablesDB,
  performedBy: string,
  { target, details }: AdminAccessLogInput,
): Promise<void> {
  try {
    await writeAuditLog(databases, {
      entityType: target.entityType,
      entityId: target.entityId,
      action: 'access',
      performedBy,
      previousValues: null,
      newValues: await details(),
    });
  } catch (error) {
    console.error(`Failed to write '${target.entityType}' access audit log`, error);
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
