import { Users, Messaging, ID, Query } from 'node-appwrite';
import { resolveAppUrl } from './admin-users.js';

export const ADMIN_ALERT_MAX_RECIPIENTS = 20;

/**
 * Best-effort plain-text email to every active Admin (capped), with a link to `linkPath` in the
 * app when APP_URL is configured. Never throws: the alert is a courtesy beside work that has
 * already been done, and must not fail or slow the request that triggered it.
 */
export async function notifyAdmins({
  adminClient,
  subject,
  text,
  linkPath,
  label = 'Admin alert',
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
      subject,
      content: withLink({ text, linkPath, appUrl: resolveAppUrl(error) }),
      html: false,
      users: adminIds,
    });
  } catch (err) {
    error(`${label} email failed: ${err.message}`);
  }
}

async function listActiveAdminIds({ UsersCtor, adminClient }) {
  const { users } = await new UsersCtor(adminClient).list({
    queries: [Query.equal('labels', ['admin']), Query.limit(ADMIN_ALERT_MAX_RECIPIENTS)],
  });
  return users.filter(isActiveAdmin).map((user) => user.$id);
}

function isActiveAdmin(user) {
  return user.status === true && (user.labels ?? []).includes('admin');
}

function withLink({ text, linkPath, appUrl }) {
  if (appUrl === '#') {
    return text;
  }
  return `${text}\n\n${appUrl.replace(/\/+$/, '')}${linkPath}`;
}
