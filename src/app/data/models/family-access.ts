import type { EventStatus, EventType } from './event';

/**
 * What a Family Member is allowed to know about an event — no id, no host name, no
 * assignedUserIds. Mirrors exactly what resolveAccessCode's Function action returns.
 */
export interface FamilyEventSummary {
  name: string;
  type: EventType;
  venue?: string;
  date: string;
  status: EventStatus;
}
