import type { EventStatus } from '../../../../data/models/event';

export interface StatusAction {
  readonly label: string;
  readonly to: EventStatus;
}

// Mirrors the Function's ALLOWED_TRANSITIONS (Story 2.2) — display only; the Function refuses
// any other transition regardless.
export const STATUS_ACTIONS: Record<EventStatus, readonly StatusAction[]> = {
  active: [
    { label: 'Pause', to: 'paused' },
    { label: 'Close', to: 'closed' },
  ],
  paused: [
    { label: 'Resume', to: 'active' },
    { label: 'Close', to: 'closed' },
  ],
  closed: [{ label: 'Reopen', to: 'active' }],
};

const STATUS_LABELS: Record<EventStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  closed: 'Closed',
};

export function statusLabel(status: EventStatus): string {
  return STATUS_LABELS[status];
}
