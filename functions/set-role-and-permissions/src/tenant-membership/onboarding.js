import { randomBytes } from 'node:crypto';
import { ID, Query, Permission, Role } from 'node-appwrite';
import {
  hasValue,
  listAllRows,
  isConflictError,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from '../shared.js';
import { sendInviteEmail } from '../admin-users.js';
import { createMembershipRow } from './memberships.js';

// Matches the tenant_documents bucket's own allowed extensions (pdf/jpg/jpeg/png). The bucket
// enforces this at upload; re-checked here because the Function is the one place a file is
// accepted as evidence.
const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/**
 * Story 6.4, FR-6 path (a): Admin vouches for the company, so the Tenant is written straight to
 * `approved` (verifiedBy/verifiedAt = this Admin, now) with an active super_organizer
 * Membership on a brand-new Account — the same end state path (b) reaches after Story 6.5's
 * approval, so both paths converge on one account shape. Any failure after the Account exists
 * rolls back what was already written rather than leaving a half-provisioned Organizer.
 */
export async function handleInviteOrganizer({
  DatabasesCtor,
  UsersCtor,
  MessagingCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  error,
}) {
  const { company } = payload;
  const name = normalizeName(payload.name);
  const email = normalizeEmail(payload.email);
  const databases = new DatabasesCtor(adminClient);
  const users = new UsersCtor(adminClient);
  const generatedPassword = randomBytes(12).toString('base64url');

  let account;
  try {
    account = await users.create({ userId: ID.unique(), email, password: generatedPassword, name });
  } catch (err) {
    if (isConflictError(err)) {
      error(`inviteOrganizer: email ${email} already registered: ${err.message}`);
      return { status: 409, body: { error: 'A user with this email already exists' } };
    }
    error(`inviteOrganizer: users.create failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to create user account' } };
  }

  const now = new Date().toISOString();
  let tenant;
  try {
    tenant = await databases.createRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: ID.unique(),
      data: {
        ...companyRowData(company),
        status: 'approved',
        superOrganizerId: account.$id,
        verifiedBy: caller.$id,
        verifiedAt: now,
        createdAt: now,
      },
      permissions: tenantRowPermissions(account.$id),
    });
  } catch (err) {
    error(`inviteOrganizer: tenant createRow failed: ${err.message}`);
    await compensate(
      [['delete account', () => users.delete({ userId: account.$id })]],
      error,
      'inviteOrganizer',
    );
    return { status: 502, body: { error: 'Failed to create the company' } };
  }

  const membershipResult = await createMembershipRow({
    databases,
    databaseId,
    membershipsCollectionId,
    userId: account.$id,
    tenantId: tenant.$id,
    role: 'super_organizer',
    grantedBy: caller.$id,
    error,
    errorContext: 'inviteOrganizer',
    conflictMessage: 'Failed to create membership for newly created account',
  });
  if (membershipResult.status !== 200) {
    await compensate(
      [
        [
          'delete tenant',
          () =>
            databases.deleteRow({ databaseId, tableId: tenantsCollectionId, rowId: tenant.$id }),
        ],
        ['delete account', () => users.delete({ userId: account.$id })],
      ],
      error,
      'inviteOrganizer',
    );
    return membershipResult;
  }

  // Delivery failure never fails the invite — the Organizer already exists, and the password
  // stays in the response as the Admin's fallback (same contract as admin-users.js createUser).
  const inviteStatus = {
    email: await sendInviteEmail({
      MessagingCtor,
      adminClient,
      userId: account.$id,
      name,
      role: 'Organizer',
      email,
      generatedPassword,
      error,
    }),
  };

  return {
    status: 200,
    body: {
      success: true,
      userId: account.$id,
      tenantId: tenant.$id,
      membershipId: membershipResult.body.membershipId,
      tenantStatus: 'approved',
      generatedPassword,
      inviteStatus,
    },
  };
}

/**
 * Story 6.4, FR-6 path (b) / FR-7: the applicant's own just-created Account submits the
 * wizard's intake. Writes a `pending` Tenant (superOrganizerId = the verified caller, never a
 * client value) plus their active super_organizer Membership. Refuses any caller that already
 * holds a platform relationship — a Label or any Membership row — since FR-4/FR-5 give every
 * tenant relationship its own Account. The document must already sit in the tenant-documents
 * bucket, uploaded by this caller; once accepted it is locked to read-only for the applicant
 * so the evidence Admin reviews can't be swapped or deleted afterwards.
 */
export async function handleSubmitTenantApplication({
  DatabasesCtor,
  StorageCtor,
  adminClient,
  payload,
  caller,
  databaseId,
  tenantsCollectionId,
  membershipsCollectionId,
  documentsBucketId,
  error,
}) {
  const { company, verificationDocumentId } = payload;
  const databases = new DatabasesCtor(adminClient);
  const alreadyRelated = { status: 409, body: { error: "We couldn't process this application" } };

  if ((caller.labels ?? []).length > 0) {
    return alreadyRelated;
  }

  let existingMemberships;
  try {
    existingMemberships = await listAllRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: membershipsCollectionId,
      queries: [Query.equal('userId', [caller.$id])],
    });
  } catch (err) {
    error(`submitTenantApplication: membership lookup failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to verify existing memberships' } };
  }
  if (existingMemberships.length > 0) {
    return alreadyRelated;
  }

  const storage = new StorageCtor(adminClient);
  let file;
  try {
    file = await storage.getFile({ bucketId: documentsBucketId, fileId: verificationDocumentId });
  } catch (err) {
    error(`submitTenantApplication: document ${verificationDocumentId} not found: ${err.message}`);
    return { status: 400, body: { error: 'The uploaded document could not be found' } };
  }
  // A client can only grant permissions for roles it holds itself, so update("user:<caller>")
  // on the file means the caller uploaded it (and it hasn't been claimed/locked yet).
  const uploadedByCaller = (file.$permissions ?? []).includes(
    Permission.update(Role.user(caller.$id)),
  );
  if (!uploadedByCaller) {
    return { status: 400, body: { error: 'The uploaded document could not be found' } };
  }
  if (!DOCUMENT_MIME_TYPES.includes(file.mimeType)) {
    return { status: 400, body: { error: 'The document must be a PDF, JPG, or PNG file' } };
  }

  const now = new Date().toISOString();
  let tenant;
  try {
    tenant = await databases.createRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: ID.unique(),
      data: {
        ...companyRowData(company),
        status: 'pending',
        superOrganizerId: caller.$id,
        verificationDocumentId,
        createdAt: now,
      },
      permissions: tenantRowPermissions(caller.$id),
    });
  } catch (err) {
    error(`submitTenantApplication: tenant createRow failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to submit the application' } };
  }

  const membershipResult = await createMembershipRow({
    databases,
    databaseId,
    membershipsCollectionId,
    userId: caller.$id,
    tenantId: tenant.$id,
    role: 'super_organizer',
    grantedBy: caller.$id,
    error,
    errorContext: 'submitTenantApplication',
  });
  if (membershipResult.status !== 200) {
    await compensate(
      [
        [
          'delete tenant',
          () =>
            databases.deleteRow({ databaseId, tableId: tenantsCollectionId, rowId: tenant.$id }),
        ],
      ],
      error,
      'submitTenantApplication',
    );
    return membershipResult.status === 409 ? alreadyRelated : membershipResult;
  }

  try {
    await storage.updateFile({
      bucketId: documentsBucketId,
      fileId: verificationDocumentId,
      permissions: [Permission.read(Role.label('admin')), Permission.read(Role.user(caller.$id))],
    });
  } catch (err) {
    // Non-fatal: the application is complete; the file just stays applicant-editable.
    error(
      `submitTenantApplication: locking document ${verificationDocumentId} failed: ${err.message}`,
    );
  }

  return {
    status: 200,
    body: {
      success: true,
      tenantId: tenant.$id,
      membershipId: membershipResult.body.membershipId,
      tenantStatus: 'pending',
    },
  };
}

function companyRowData(company) {
  return {
    ...companyIdentityData(company),
    size: company.size,
    type: company.type,
    estimatedUserCount: company.estimatedUserCount,
  };
}

/** The Tenant fields its own Super Organizer may later edit (company-profile.js). */
export function companyIdentityData(company) {
  return {
    name: company.name.trim(),
    location: company.location.trim(),
    ...(hasValue(company.contactPhone)
      ? { contactPhone: normalizePhone(company.contactPhone) }
      : {}),
  };
}

function tenantRowPermissions(superOrganizerId) {
  return [Permission.read(Role.label('admin')), Permission.read(Role.user(superOrganizerId))];
}

/** Undo steps for a multi-write action — each is best-effort and logged, never thrown. */
async function compensate(steps, error, errorContext) {
  const failures = [];
  for (const [label, run] of steps) {
    try {
      await run();
    } catch (err) {
      failures.push(label);
      error(`${errorContext}: compensation "${label}" failed: ${err.message}`);
    }
  }
  return failures;
}
