/** A Donation an Operator recorded on this device, waiting for the Function to accept it. */
export interface OutboxEntry {
  localId?: number;
  entityType: 'donation';
  entityId: string;
  op: 'create';
  payload: unknown;
  /** 'failed' is terminal: the server definitively rejected this entry (a 4xx), so the sync
   *  engine stops retrying it and it no longer counts as pending. */
  status: 'pending' | 'synced' | 'conflict' | 'failed';
  /** The server's reason, set when status becomes 'failed'. */
  lastError?: string;
  retries: number;
  createdAt: string;
}
