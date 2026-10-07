import { Users, Messaging, ID, Query } from 'node-appwrite';
import { resolveAppUrl } from './admin-users.js';

export const DISPUTE_EMAIL_MAX_RECIPIENTS = 20;
export const DISPUTE_EMAIL_EXCERPT_MAX = 300;

/**
 * Best-effort heads-up to active Admins that a suspended company filed a dispute — those
 * submitters can't sign in, so nobody would otherwise look at the inbox. Never throws: the
 * submission has already been stored and must not fail because an email didn't go out.
 * Only the company, its contact email and a message excerpt are sent.
 */
export async function notifyAdminsOfDispute({
  adminClient,
  dispute,
  error,
  UsersCtor = Users,
  MessagingCtor = Messaging,
}) {
  try {
    const adminIds = await listActiveAdminIds({ UsersCtor, adminClient });
    if (adminIds.length === 0) {
      return;
    }
    await new MessagingCtor(adminClient).createEmail({
      messageId: ID.unique(),
      subject: 'Givio: a company submitted a dispute',
      content: renderDisputeEmail({ dispute, appUrl: resolveAppUrl(error) }),
      html: false,
      users: adminIds,
    });
  } catch (err) {
    error(`Dispute notification email failed: ${err.message}`);
  }
}

async function listActiveAdminIds({ UsersCtor, adminClient }) {
  const { users } = await new UsersCtor(adminClient).list({
    queries: [Query.equal('labels', ['admin']), Query.limit(DISPUTE_EMAIL_MAX_RECIPIENTS)],
  });
  return users.filter(isActiveAdmin).map((user) => user.$id);
}

function isActiveAdmin(user) {
  return user.status === true && (user.labels ?? []).includes('admin');
}

function renderDisputeEmail({ dispute, appUrl }) {
  const lines = [
    `A company has submitted a dispute: ${dispute.tenantName} — ${dispute.contactEmail}`,
    '',
    excerpt(dispute.message),
  ];
  if (appUrl !== '#') {
    lines.push('', `${appUrl.replace(/\/+$/, '')}/dashboard/support`);
  }
  return lines.join('\n');
}

function excerpt(message) {
  return message.length > DISPUTE_EMAIL_EXCERPT_MAX
    ? `${message.slice(0, DISPUTE_EMAIL_EXCERPT_MAX)}…`
    : message;
}
