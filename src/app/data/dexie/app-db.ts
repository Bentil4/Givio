import Dexie, { type Table } from 'dexie';
import type { Event } from '../models/event';
import type { OutboxEntry } from './outbox-entry';

export class AppDb extends Dexie {
  events!: Table<Event, string>;
  outbox!: Table<OutboxEntry, number>;

  constructor() {
    super('givio');
    this.version(1).stores({
      events: 'id, status, date',
      outbox: '++localId, entityType, status',
    });
  }
}

export const appDb = new AppDb();
