import { describe, it, expect } from 'vitest';
import { AppDb } from './app-db';

describe('AppDb', () => {
  it('opens and round-trips an Event through the events table', async () => {
    const db = new AppDb();
    await db.events.put({
      id: 'e1',
      name: 'Test',
      type: 'wedding',
      date: '2026-01-01',
      hostName: 'Host',
      status: 'active',
      assignedUserIds: [],
      createdBy: 'u1',
      nextReceiptSeq: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const record = await db.events.get('e1');

    expect(record?.name).toBe('Test');
    db.close();
    await db.delete();
  });

  it('opens and round-trips a Donation through the donations table', async () => {
    const db = new AppDb();
    await db.donations.put({
      id: 'd1',
      eventId: 'e1',
      receiptNumber: 'P-1',
      donorName: 'Ama',
      amountMinor: 5000,
      donationType: 'cash',
      recordedBy: 'u1',
      recordedAt: '2026-01-01T00:00:00.000Z',
      syncStatus: 'pending',
    });

    const record = await db.donations.get('d1');

    expect(record?.donorName).toBe('Ama');
    db.close();
    await db.delete();
  });
});
