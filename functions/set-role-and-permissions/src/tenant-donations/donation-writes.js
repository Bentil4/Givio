import { writeTenantAuditLog } from '../tenant-events/event-audit.js';
import { pickDonationPatch } from './donation-fields.js';
import { authorizeTenantDonationAccess, donationsTableId } from './donation-scope.js';

/**
 * A Super Organizer's correction to one of their company's donations, under the same rules as
 * Admin's: a soft-deleted record can't be edited, and the reason goes in the audit trail.
 * The row's permissions are left exactly as recordDonation derived them (AD-2) — updateRow is
 * never given a permissions list here.
 */
export async function editTenantDonation(context) {
  const access = await authorizeTenantDonationAccess(context);
  if (access.errorResponse) {
    return access.errorResponse;
  }
  if (access.donation.deletedAt) {
    return badRequest('Cannot edit a deleted donation');
  }
  const changes = pickDonationPatch(context.payload.patch);
  return saveDonationChange({ ...context, ...access, changes, action: 'edit' });
}

/** Hidden from every total and export, never erased — Admin's soft delete, with its reason. */
export async function softDeleteTenantDonation(context) {
  const access = await authorizeTenantDonationAccess(context);
  if (access.errorResponse) {
    return access.errorResponse;
  }
  if (access.donation.deletedAt) {
    return badRequest('Donation is already deleted');
  }
  const changes = {
    deletedAt: new Date().toISOString(),
    deletedBy: context.caller.$id,
    deletionReason: context.payload.reason.trim(),
  };
  return saveDonationChange({ ...context, ...access, changes, action: 'delete' });
}

/** Puts a soft-deleted donation back into every total, as Admin's recover does. */
export async function restoreTenantDonation(context) {
  const access = await authorizeTenantDonationAccess(context);
  if (access.errorResponse) {
    return access.errorResponse;
  }
  if (!access.donation.deletedAt) {
    return badRequest('Donation is not deleted');
  }
  const changes = { deletedAt: null, deletedBy: null, deletionReason: null };
  return saveDonationChange({ ...context, ...access, changes, action: 'restore' });
}

async function saveDonationChange(context) {
  const { DatabasesCtor, adminClient, donation, changes, error } = context;
  // Snapshotted before the write: the row object may be the one the write updates.
  const before = donationSnapshot(donation);
  let row;
  try {
    row = await new DatabasesCtor(adminClient).updateRow({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId: donationsTableId(),
      rowId: donation.$id,
      data: { ...changes, updatedAt: new Date().toISOString() },
    });
  } catch (err) {
    error(`tenant donation ${donation.$id}: updateRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to save the donation' } };
  }
  await auditDonationChange({ ...context, before, after: donationSnapshot(row) });
  return { status: 200, body: { success: true, donation: row } };
}

/** The same entry Admin's client writes (entityType 'donation'), plus the Event's tenantId. */
async function auditDonationChange(context) {
  const { DatabasesCtor, adminClient, caller, tenantId, action, before, after, error } = context;
  const reason = action === 'edit' ? { reason: context.payload.reason.trim() } : {};
  await writeTenantAuditLog({
    DatabasesCtor,
    adminClient,
    entry: {
      entityType: 'donation',
      entityId: before.id,
      action,
      performedBy: caller.$id,
      previousValues: before,
      newValues: { ...after, ...reason, tenantId },
    },
    error,
  });
}

/** A row as the app's Donation model names it: `$` system fields dropped, `$id` as `id`. */
export function donationSnapshot(row) {
  const fields = Object.entries(row).filter(([key]) => !key.startsWith('$'));
  return { id: row.$id, ...Object.fromEntries(fields) };
}

function badRequest(message) {
  return { status: 400, body: { error: message } };
}
