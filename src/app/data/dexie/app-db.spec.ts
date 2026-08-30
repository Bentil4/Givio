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
});
