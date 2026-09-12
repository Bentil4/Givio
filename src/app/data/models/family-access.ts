import type { EventStatus, EventType } from './event';

/** Single source of truth for the raw code length — also lets family-live.ts tell a legacy,
 *  pre-base64url-encoding shared link (always exactly this long) apart from an encoded one. */
export const FAMILY_CODE_LENGTH = 8;

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
