import { Injectable, inject } from '@angular/core';
import { Models, Query } from 'appwrite';
import { DATABASES } from '../appwrite/client';
import { rowToAuditLogEntry } from './audit-log-writer';
import type { AuditLogEntry } from '../models/audit-log';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuditLogDataService {
  private readonly databases = inject(DATABASES);

  /**
   * Admin-only, read-only, no offline support — the audit trail (FR-SEC-004) is a live
   * server view by design, not part of the offline-first event/donation flow, so unlike
   * EventDataService/DonationDataService there's no Dexie table or fallback here.
   */
  async listAuditLogs(): Promise<AuditLogEntry[]> {
    const PAGE_SIZE = 100;
    const entries: AuditLogEntry[] = [];
    let cursor: string | undefined;

    for (;;) {
      const queries = [Query.orderDesc('timestamp'), Query.limit(PAGE_SIZE)];
      if (cursor) queries.push(Query.cursorAfter(cursor));

      const page = await this.databases.listRows<Models.DefaultRow>({
        databaseId: environment.appwriteDatabaseId,
        tableId: environment.auditLogsCollectionId,
        queries,
      });

      entries.push(...page.rows.map(rowToAuditLogEntry));
      if (page.rows.length < PAGE_SIZE) break;
      cursor = page.rows[page.rows.length - 1].$id;
    }

    return entries;
  }
}
