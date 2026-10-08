import { notifyAdmins, ADMIN_ALERT_MAX_RECIPIENTS } from './admin-alerts.js';

export const DISPUTE_EMAIL_MAX_RECIPIENTS = ADMIN_ALERT_MAX_RECIPIENTS;
export const DISPUTE_EMAIL_EXCERPT_MAX = 300;

/**
 * Best-effort heads-up to active Admins that a suspended company filed a dispute — those
 * submitters can't sign in, so nobody would otherwise look at the inbox. Never throws: the
 * submission has already been stored and must not fail because an email didn't go out.
 * Only the company, its contact email and a message excerpt are sent.
 */
export function notifyAdminsOfDispute({ dispute, ...delivery }) {
  return notifyAdmins({
    ...delivery,
    subject: 'Givio: a company submitted a dispute',
    text: renderDisputeText(dispute),
    linkPath: '/dashboard/support',
    label: 'Dispute notification',
  });
}

function renderDisputeText(dispute) {
  return [
    `A company has submitted a dispute: ${dispute.tenantName} — ${dispute.contactEmail}`,
    '',
    excerpt(dispute.message),
  ].join('\n');
}

function excerpt(message) {
  return message.length > DISPUTE_EMAIL_EXCERPT_MAX
    ? `${message.slice(0, DISPUTE_EMAIL_EXCERPT_MAX)}…`
    : message;
}
