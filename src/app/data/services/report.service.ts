import { InjectionToken, Injectable, inject } from '@angular/core';
// eslint-disable-next-line @typescript-eslint/naming-convention
import * as sheetjs from '../../../vendor/sheetjs/xlsx.mjs';
import { DONATION_TYPE_LABELS, totalMinor, type Donation } from '../models/donation';

export interface ExportOptions {
  /** Family export (Story 4.4): drops Phone and Recorded By — never shown outside Admin/Operator. */
  sanitized?: boolean;
}

/**
 * Wraps the vendored SheetJS module the same way appwrite/client.ts wraps the Appwrite SDK —
 * a real static import, but reached through DI so tests can substitute a fake without vi.mock
 * (Angular's vitest builder rejects vi.mock for relative imports).
 */
export const XLSX = new InjectionToken<typeof sheetjs>('XLSX', {
  providedIn: 'root',
  factory: () => sheetjs,
});

const FULL_HEADER = [
  'Receipt No.',
  'Donor Name',
  'Phone',
  'Amount (GHS)',
  'Type',
  'Donated On Behalf Of',
  'Notes',
  'Recorded By',
  'Date & Time',
];

const SANITIZED_HEADER = [
  'Receipt No.',
  'Donor Name',
  'Amount (GHS)',
  'Type',
  'Donated On Behalf Of',
  'Notes',
  'Date & Time',
];

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly xlsx = inject(XLSX);

  /**
   * Client-side only (Story 4.2/4.4, Cross-Cutting DoD) — vendored SheetJS, never
   * `npm install xlsx` (src/vendor/sheetjs/README.md has the provenance). Amount is written as
   * a plain number (amountMinor / 100), not a formatted string, so the totals row is a real
   * Excel SUM the file's own math backs up — matching the in-app total to the pesewa means the
   * same division this file's totals row does, not a separately-rounded display string.
   */
  exportDonationsXlsx(eventName: string, donations: readonly Donation[], options: ExportOptions = {}): void {
    const rows = donations.filter((d) => !d.deletedAt && d.syncStatus !== 'conflict');
    const totalGhs = totalMinor(rows) / 100;

    const header = options.sanitized ? SANITIZED_HEADER : FULL_HEADER;
    const body = rows.map((d) => this.toRow(d, options));
    const totalRow: (string | number)[] = header.map(() => '');
    totalRow[header.indexOf('Amount (GHS)')] = totalGhs;
    totalRow[header.length - 1] = 'Total';

    const sheet = this.xlsx.utils.aoa_to_sheet([header, ...body, totalRow]);
    const book = this.xlsx.utils.book_new();
    this.xlsx.utils.book_append_sheet(book, sheet, 'Donations');

    const safeName = eventName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Event';
    const dateStamp = new Date().toISOString().slice(0, 10);
    this.xlsx.writeFileXLSX(book, `DMS_${safeName}_${dateStamp}.xlsx`);
  }

  private toRow(d: Donation, options: ExportOptions): (string | number)[] {
    const amount = d.amountMinor === null ? '' : d.amountMinor / 100;
    if (options.sanitized) {
      return [
        d.receiptNumber,
        d.donorName,
        amount,
        DONATION_TYPE_LABELS[d.donationType],
        d.onBehalfOf ?? '',
        d.notes ?? '',
        d.recordedAt,
      ];
    }
    return [
      d.receiptNumber,
      d.donorName,
      d.donorPhone ?? '',
      amount,
      DONATION_TYPE_LABELS[d.donationType],
      d.onBehalfOf ?? '',
      d.notes ?? '',
      d.recordedBy,
      d.recordedAt,
    ];
  }
}
