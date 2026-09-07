export type AuditEntityType = 'event' | 'donation';
export type AuditAction = 'create' | 'edit' | 'delete' | 'recover' | 'assign';

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
