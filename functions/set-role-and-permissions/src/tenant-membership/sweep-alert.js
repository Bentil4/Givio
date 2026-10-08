import { notifyAdmins } from '../admin-alerts.js';

/**
 * A failed (or out-of-time) permission sweep outside the Admin's own backfill leaves a company's
 * Events readable by the wrong people until someone retries it — and the person whose click
 * triggered it may not be an Admin. Emails the Admins so a failure is not discovered by accident.
 * `tenantName` saves a lookup when the caller already holds the Tenant row. Never throws.
 */
export async function alertAdminsOfFailedSweep({ tenantId, tenantName, grants, ...context }) {
  const name = tenantName ?? (await lookupTenantName({ ...context, tenantId }));
  await notifyAdmins({
    adminClient: context.adminClient,
    UsersCtor: context.UsersCtor,
    MessagingCtor: context.MessagingCtor,
    error: context.error,
    subject: `Permission sweep failed for ${name}`,
    text: [
      `Tenant: ${name} (${tenantId})`,
      `Failed rows: ${grants.failureCount}`,
      `Timed out: ${grants.timedOut ? 'yes' : 'no'}`,
      '',
      'Its Event permissions may be out of date until the sweep is retried.',
    ].join('\n'),
    linkPath: '/dashboard/companies',
    label: 'Permission sweep alert',
  });
}

async function lookupTenantName({
  DatabasesCtor,
  adminClient,
  databaseId,
  tenantsCollectionId,
  tenantId,
}) {
  try {
    const tenant = await new DatabasesCtor(adminClient).getRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: tenantId,
    });
    return tenant.name ?? tenantId;
  } catch {
    return tenantId;
  }
}
