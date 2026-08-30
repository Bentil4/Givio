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
  status: EventStatus;
  accessCode?: string;
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
