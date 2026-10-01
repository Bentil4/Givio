import type { EventStatus, EventType } from './event';

export type DuplicateFlagDecision = 'confirm' | 'clear';

export type DuplicateMatchField = 'name' | 'hostName';

/** One side of a flagged pair, as the Event stands when the queue is read. */
export interface FlaggedEvent {
  id: string;
  /** Null only if the Event can no longer be read. */
  name: string | null;
  hostName: string | null;
  type: EventType | null;
  date: string | null;
  venue: string | null;
  status: EventStatus | null;
  /** Null for an Admin-created Event. */
  tenantId: string | null;
  tenantName: string | null;
}

/** One row of the listDuplicateEventFlags Function action (Story 7.4). */
export interface DuplicateEventFlag {
  flagId: string;
  matchedOn: DuplicateMatchField[];
  flaggedAt: string;
  /** The Event whose creation raised the flag. */
  event: FlaggedEvent;
  matchedEvent: FlaggedEvent;
}
