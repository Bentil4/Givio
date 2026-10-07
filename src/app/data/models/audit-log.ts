export type AuditEntityType = 'event' | 'donation';
/** Mirrors the audit_logs table's actual `action` enum exactly — 'restore', not 'recover'.
 *  'access' rows are Story 8.2's Admin read log, no longer written since AD-12's 2026-10-07
 *  amendment removed Admin access to company data; historic ones still display. */
export type AuditAction = 'create' | 'edit' | 'delete' | 'restore' | 'access';

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

/** One page of a Super Organizer's tenant-scoped trail (Story 7.5's listTenantAuditLog). */
export interface TenantAuditPage {
  readonly entries: readonly AuditLogEntry[];
  /** Pass back to fetch the next (older) page; `null` once the trail is exhausted. */
  readonly nextCursor: string | null;
}
