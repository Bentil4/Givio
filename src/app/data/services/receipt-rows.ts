import { DONATION_TYPE_LABELS, type Donation } from '../models/donation';
import { formatCedis } from '../../utils/donation.util';

/** A receipt row: label, value, and whether the value needs the embedded Unicode font. */
export type ReceiptRow = [label: string, value: string, needsCediFont?: boolean];

/** The label/value rows printed in a receipt's body, in print order. */
export function receiptRows(donation: Donation, operatorName: string): ReceiptRow[] {
  return [
    ['Receipt No.', donation.receiptNumber],
    ['Date & Time', new Date(donation.recordedAt).toLocaleString('en-GH')],
    ['Donor', donation.donorName],
    ['Amount', formatCedis(donation.amountMinor), true],
    ['Type', DONATION_TYPE_LABELS[donation.donationType]],
    ...(donation.onBehalfOf
      ? [['Donated On Behalf Of', donation.onBehalfOf] satisfies ReceiptRow]
      : []),
    ['Recorded By', operatorName],
  ];
}
