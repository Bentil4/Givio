export type EventType = 'wedding' | 'funeral';
export type EventStatus = 'active' | 'paused' | 'closed';

export interface Event {
  id: string;
  name: string;
  type: EventType;
  date: string;
  hostName: string;
  venue?: string;
  description?: string;
  notes?: string;
  image?: string;
  status: EventStatus;
  accessCode?: string;
  /** Sole tenant-ownership source, set at creation and immutable thereafter (AD-2). Absent for
   *  Admin-created events (no Membership to stamp it from) until an Organizer-tier creation
   *  flow exists — see Story 6.2 Dev Notes. */
  tenantId?: string;
  assignedUserIds: string[];
  createdBy: string;
  nextReceiptSeq: number;
  createdAt: string;
  updatedAt: string;
}

/** Maps to the repo's global `.tag` chip classes (see src/styles.scss). */
export const EVENT_STATUS_CHIP: Record<EventStatus, string> = {
  active: 'tag-success',
  paused: 'tag-info',
  closed: 'tag-default',
};
