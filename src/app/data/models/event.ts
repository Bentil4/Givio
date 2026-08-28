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
