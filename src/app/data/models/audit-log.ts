export type AuditEntityType = 'event' | 'donation';
/** Mirrors the audit_logs table's actual `action` enum exactly — 'restore', not 'recover'.
 *  'access' (Story 8.2, AD-12) needs adding to the live enum before any Admin read can log. */
export type AuditAction = 'create' | 'edit' | 'delete' | 'restore' | 'access';

/** The Data-layer read methods an Admin 'access' entry names (Story 8.2, AD-12). */
export type AccessQuery = 'listEvents' | 'listDonationsForEvent' | 'listAllDonations';

/**
 * An 'access' entry's newValues. audit_logs has no tenant column, so the tenant rides in the
 * JSON rather than forcing a schema change: `tenantId` is the single tenant an event-scoped
 * read touched, `null` for a platform-wide list, where `tenantIds` holds the distinct set of
 * tenants whose rows were actually returned (events without a tenantId — pre-6.2 — omitted).
 */
export interface AccessLogDetails {
  readonly query: AccessQuery;
  readonly tenantId: string | null;
  readonly tenantIds: readonly string[];
  readonly eventId?: string;
  readonly eventName?: string;
  readonly rowCount: number;
}

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
