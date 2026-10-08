import { notifyAdmins } from './admin-alerts.js';

const ALERT_INTERVAL_MS = 60 * 60 * 1000;

// In memory on purpose: a cold start may repeat the email at most once per hour of attack,
// which costs less than an extra table read on every rejected request.
let lastAlertAtMs = Number.NEGATIVE_INFINITY;

export function resetDisputeCapAlertThrottle() {
  lastAlertAtMs = Number.NEGATIVE_INFINITY;
}

/**
 * Tells the Admins the public dispute form is being refused because the global hourly cap was
 * hit — a flood is exactly when a real company's dispute could be turned away. At most one email
 * per hour; best effort, never throws.
 */
export async function alertAdminsOfDisputeCap({ at, limit, ...delivery }) {
  if (at.getTime() - lastAlertAtMs < ALERT_INTERVAL_MS) {
    return;
  }
  lastAlertAtMs = at.getTime();
  await notifyAdmins({
    ...delivery,
    subject: 'Givio: the dispute form hit its hourly limit',
    text: `The public dispute form received ${limit} submissions in the last hour and is refusing new ones for now. If this is not a wave of real disputes, someone may be flooding it.`,
    linkPath: '/dashboard/support',
    label: 'Dispute cap alert',
  });
}
