export type AuditEntityType = 'event' | 'donation';
/** Mirrors the audit_logs table's actual `action` enum exactly — 'restore', not 'recover'. */
export type AuditAction = 'create' | 'edit' | 'delete' | 'restore';

/** Mirrors the audit_logs table row shape exactly (previousValues/newValues are stored as
 *  JSON strings server-side — this is the already-parsed client-side shape). */
export interface AuditLogEntry {
  readonly id: string;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly performedBy: string;
  readonly previousValues: unknown;
  readonly newValues: unknown;
  readonly timestamp: string;
}
