import { Role } from './role';

/**
 * Event status is the gate on every operator action:
 *   draft  → no family code issued, no entry
 *   live   → entry allowed, family code active
 *   paused → entry BLOCKED, family sees the last known total
 *   closed → read-only, code released, export only
 */
export type EventStatus = 'draft' | 'live' | 'paused' | 'closed';

export type Occasion = 'funeral' | 'wedding';

export interface EventOperator {
  readonly userId: string;
  name: string;
  initials: string;
  deskLabel: string;
  entryCount: number;
  connection: 'recording' | 'offline';
}

export interface DonationEvent {
  readonly id: string;
  name: string;
  occasion: Occasion;
  venue?: string;
  /** ISO date. Display as '5th Dec, 2025'. */
  eventDate: string;
  status: EventStatus;
  /** 8 chars, e.g. ODOI-2481. Null until the event leaves draft. Released on close. */
  familyCode: string | null;
  operators: EventOperator[];
  donorCount: number;
  totalMinor: number;
  readonly createdBy: string;
  readonly createdAt: string;
}

export function canRecordInto(event: DonationEvent | null): boolean {
  return event?.status === 'live';
}

export function blockedReason(event: DonationEvent | null): string | null {
  if (!event) return 'Pick an event before recording a donation.';
  switch (event.status) {
    case 'live': return null;
    case 'paused': return 'Giving is paused for this event. An Admin must resume it before you can record.';
    case 'closed': return 'This event is closed. Its records are read-only.';
    case 'draft': return 'This event is not open yet.';
  }
}

export const EVENT_STATUS_CHIP: Record<EventStatus, string> = {
  live: 'is-live',
  paused: 'is-paused',
  closed: 'is-closed',
  draft: 'is-draft',
};

/** Which roles may see donor phone numbers. Family access is never in this list. */
export function maySeeDonorPhone(role: Role | 'family'): boolean {
  return role === 'admin' || role === 'operator';
}
