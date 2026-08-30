import Dexie, { type Table } from 'dexie';
import type { Event } from '../models/event';
import type { Donation } from '../models/donation';
import type { OutboxEntry } from './outbox-entry';

export class AppDb extends Dexie {
  events!: Table<Event, string>;
  outbox!: Table<OutboxEntry, number>;
  donations!: Table<Donation, string>;

  constructor() {
    super('givio');
    this.version(1).stores({
      events: 'id, status, date',
      outbox: '++localId, entityType, status',
    });
    this.version(2).stores({
      events: 'id, status, date',
      outbox: '++localId, entityType, status',
      donations: 'id, eventId, recordedBy',
    });
  }
}

export const appDb = new AppDb();
