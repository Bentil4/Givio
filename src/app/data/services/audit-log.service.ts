import { Injectable, inject, signal } from '@angular/core';
import { AuditLogDataService } from './audit-log-data.service';
import type { AuditLogEntry } from '../models/audit-log';

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly auditLogDataService = inject(AuditLogDataService);
  private readonly _entries = signal<AuditLogEntry[]>([]);

  public readonly entries = this._entries.asReadonly();

  async loadAuditLogs(): Promise<void> {
    this._entries.set(await this.auditLogDataService.listAuditLogs());
  }
}
