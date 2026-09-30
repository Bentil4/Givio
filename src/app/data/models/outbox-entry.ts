export interface OutboxEntry {
  localId?: number;
  entityType: 'event' | 'donation';
  entityId: string;
  op: 'create' | 'update';
  payload: unknown;
  baseUpdatedAt?: string;
  /** 'failed' is terminal: the server definitively rejected this entry (a 4xx), so the sync
   *  engine stops retrying it and it no longer counts as pending. */
  status: 'pending' | 'synced' | 'conflict' | 'failed';
  /** The server's reason, set when status becomes 'failed'. */
  lastError?: string;
  retries: number;
  createdAt: string;
}
