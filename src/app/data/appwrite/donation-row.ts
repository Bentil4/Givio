import type { Models } from 'appwrite';
import type { Donation } from '../models/donation';

/** Mirrors the row shape recordDonation's Function writes (donation-recording.js). */
export function rowToDonation(row: Models.DefaultRow): Donation {
  return {
    id: row['$id'],
    eventId: row['eventId'],
    receiptNumber: row['receiptNumber'],
    donorName: row['donorName'],
    amountMinor: row['amountMinor'] ?? null,
    donationType: row['donationType'],
    onBehalfOf: row['onBehalfOf'] ?? undefined,
    donorPhone: row['donorPhone'] ?? undefined,
    notes: row['notes'] ?? undefined,
    recordedBy: row['recordedBy'],
    recordedAt: row['recordedAt'],
    deskLabel: row['deskLabel'] ?? undefined,
    updatedAt: row['updatedAt'] ?? undefined,
    syncStatus: row['syncStatus'] ?? 'synced',
    deletedAt: row['deletedAt'] ?? null,
    deletedBy: row['deletedBy'] ?? undefined,
    deletionReason: row['deletionReason'] ?? undefined,
  };
}
