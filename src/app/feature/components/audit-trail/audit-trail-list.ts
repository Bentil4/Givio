import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { auditActionClass, auditActionLabel, type AuditEntry } from './audit-entry';

/**
 * The rows of an audit trail, newest first — presentational only. Shared by admin-audit
 * (platform-wide) and company-audit (one tenant, Story 7.5) so both read identically; each
 * page owns its own loading, empty and filter states. `actorName` turns a performedBy id into
 * whatever that page's viewer is allowed to know about the person.
 */
@Component({
  selector: 'app-audit-trail-list',
  imports: [DatePipe],
  templateUrl: './audit-trail-list.html',
  styleUrl: './audit-trail-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
})
export class AuditTrailList {
  public readonly entries = input.required<readonly AuditEntry[]>();
  public readonly actorName = input.required<(actorId: string) => string>();

  public readonly actionLabel = auditActionLabel;
  public readonly actionClass = auditActionClass;
}
