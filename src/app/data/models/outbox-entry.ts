export interface OutboxEntry {
  localId?: number;
  entityType: 'event' | 'donation';
  entityId: string;
  op: 'create' | 'update';
  payload: unknown;
  baseUpdatedAt?: string;
  status: 'pending' | 'synced' | 'conflict' | 'failed';
  retries: number;
  createdAt: string;
}
