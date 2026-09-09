import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { DONATION_TYPE_LABELS, formatCedis, type Donation } from '../models/donation';
import type { Event } from '../models/event';

const PAGE_FORMAT = 'a5';
const MARGIN = 14;
const THANK_YOU_MESSAGE = 'Thank you for your generous giving.';

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Receipt';
}

/**
 * Client-side only, fully offline-capable (FR-REC-003, Story 3.6) — jsPDF renders entirely in
 * the browser, no server round-trip, so a receipt prints the instant a donation is saved
 * regardless of connectivity. `donation.receiptNumber` is whatever this record currently
 * carries — a provisional AD-8 number offline, the canonical one once synced — so this service
 * only decides whether to show the "provisional" marker (via `syncStatus`), never regenerates
 * the number itself.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptService {
  downloadReceipt(donation: Donation, event: Event, operatorName: string): void {
    const doc = this.buildDoc(donation, event, operatorName);
    doc.save(this.filename(event, donation));
  }

  /** Opens the generated PDF in a new tab and asks the browser's own PDF viewer to print it. */
  printReceipt(donation: Donation, event: Event, operatorName: string): void {
    const doc = this.buildDoc(donation, event, operatorName);
    doc.autoPrint();
    window.open(doc.output('bloburl').toString(), '_blank');
  }

  private filename(event: Event, donation: Donation): string {
    return `Receipt_${safeFilenamePart(event.name)}_${safeFilenamePart(donation.receiptNumber)}.pdf`;
  }

  /** A5, per FR-REC-002 — small enough to hand-carry, large enough to stay legible when printed. */
  private buildDoc(donation: Donation, event: Event, operatorName: string): jsPDF {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: PAGE_FORMAT });
    const pageWidth = doc.internal.pageSize.getWidth();
    const center = pageWidth / 2;
    let y = MARGIN;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(event.name, center, y, { align: 'center' });
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(event.type === 'wedding' ? 'Wedding' : 'Funeral', center, y, { align: 'center' });
    y += 5;

    // Prominent event name + dividing line/border (FR-REC-004).
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 8;

    if (donation.syncStatus !== 'synced') {
      doc.setFont('helvetica', 'bolditalic');
      doc.setFontSize(9);
      doc.setTextColor(180, 60, 0);
      doc.text('PROVISIONAL — number will update once this record syncs', center, y, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y += 7;
    }

    const rows: [string, string][] = [
      ['Receipt No.', donation.receiptNumber],
      ['Date & Time', new Date(donation.recordedAt).toLocaleString('en-GH')],
      ['Donor', donation.donorName],
      ['Amount', formatCedis(donation.amountMinor)],
      ['Type', DONATION_TYPE_LABELS[donation.donationType]],
    ];
    if (donation.onBehalfOf) {
      rows.push(['Donated On Behalf Of', donation.onBehalfOf]);
    }
    rows.push(['Recorded By', operatorName]);

    doc.setFontSize(11);
    for (const [label, value] of rows) {
      doc.setFont('helvetica', 'bold');
      doc.text(label, MARGIN, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, pageWidth - MARGIN, y, { align: 'right' });
      y += 7;
    }

    y += 5;
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 8;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text(THANK_YOU_MESSAGE, center, y, { align: 'center' });

    return doc;
  }
}
