import type { AuditLogEntry } from '../../../data/models/audit-log';
import type { TagVariant } from '../../../shared/components/tag/tag';

export type AuditAction =
  'create' | 'edit' | 'delete' | 'restore' | 'access' | 'assign' | 'security';

export interface AuditEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly action: AuditAction;
  /** One sentence naming what happened, in past tense. */
  readonly summary: string;
  /** The supporting detail — a reason, an IP, a device id. */
  readonly detail?: string;
  readonly actor: string;
}

/** Maps the real audit_logs row shape into the trail's display shape — every mutation writes
 *  entityType/entityId/previousValues/newValues, not a ready-made sentence, so one gets built
 *  here from whichever side of the change actually has the identifying field. Shared by
 *  admin-audit (platform-wide) and company-audit (one tenant, Story 7.5). */
export function toAuditEntry(entry: AuditLogEntry): AuditEntry {
  if (entry.action === 'access') return toAccessEntry(entry);
  const before = asRecord(entry.previousValues);
  const after = asRecord(entry.newValues);
  const noun = entry.entityType === 'event' ? 'Event' : 'Donation';
  const rawLabel =
    entry.entityType === 'event'
      ? (after['name'] ?? before['name'])
      : (after['receiptNumber'] ?? before['receiptNumber']);
  const label = typeof rawLabel === 'string' ? rawLabel : '';
  const verb: Record<Exclude<AuditLogEntry['action'], 'access'>, string> = {
    create: 'created',
    edit: 'edited',
    delete: 'deleted',
    restore: 'restored',
  };
  const detail = typeof after['reason'] === 'string' ? after['reason'] : undefined;

  return {
    id: entry.id,
    timestamp: entry.timestamp,
    action: entry.action,
    summary: `${noun} ${label} ${verb[entry.action]}`.trim(),
    detail,
    actor: entry.performedBy,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Story 8.2 (AD-12): a historic Admin read — one row per Data-layer query, so the summary
 *  names the query's scope and size rather than a single record. */
function toAccessEntry(entry: AuditLogEntry): AuditEntry {
  const details = asRecord(entry.newValues);
  const rowCount = typeof details['rowCount'] === 'number' ? details['rowCount'] : 0;
  const tenantIds = Array.isArray(details['tenantIds']) ? details['tenantIds'] : [];
  const noun = entry.entityType === 'event' ? 'event' : 'donation';
  const eventName = typeof details['eventName'] === 'string' ? details['eventName'] : '';

  const summary =
    details['query'] === 'listDonationsForEvent'
      ? `Viewed ${plural(rowCount, noun)} for ${eventName || 'an event'}`
      : `Viewed all ${noun}s (${plural(rowCount, noun)})`;
  const tenantId = typeof details['tenantId'] === 'string' ? details['tenantId'] : null;
  const detail = tenantId
    ? `Tenant ${tenantId}`
    : details['query'] === 'listDonationsForEvent'
      ? 'Event has no tenant'
      : `Across ${plural(tenantIds.length, 'tenant')}`;

  return {
    id: entry.id,
    timestamp: entry.timestamp,
    action: 'access',
    summary,
    detail,
    actor: entry.performedBy,
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function auditActionLabel(action: AuditAction | 'all'): string {
  if (action === 'all') return 'All actions';
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/** Security rows are the ones an Admin scans for, so they alone carry the error (red) tone;
 *  delete gets the warning (amber) tone, restore the success (green) tone, and everything else
 *  (create, edit, access, assign) stays neutral — shares the app-tag component's tone set
 *  instead of a separate one-off palette. */
export function auditActionVariant(action: AuditAction): TagVariant {
  switch (action) {
    case 'security':
      return 'error';
    case 'delete':
      return 'warning';
    case 'restore':
      return 'success';
    default:
      return 'default';
  }
}
