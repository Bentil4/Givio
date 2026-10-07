import { Client, Account, TablesDB } from 'node-appwrite';
import { PAYLOAD_VALIDATORS } from './tenant-donations/donation-fields.js';
import { prepareOrganizerRequest } from './tenant-events/organizer-request.js';
import {
  editTenantDonation,
  softDeleteTenantDonation,
  restoreTenantDonation,
} from './tenant-donations/donation-writes.js';
import { listTenantConflicts, resolveTenantConflict } from './tenant-donations/tenant-conflicts.js';

const ACTION_HANDLERS = {
  editTenantDonation,
  softDeleteTenantDonation,
  restoreTenantDonation,
  listTenantConflicts,
  resolveTenantConflict,
};

const ACTIONS = Object.keys(ACTION_HANDLERS);

/**
 * A company's Super Organizer is the only one who corrects their own company's donations:
 * correct, soft-delete and restore a donation, and resolve its sync conflicts (platform Admins
 * have no access to company donations — AD-12, amended 2026-10-07).
 * Online-only through this Function, like tenant-events.js: the Tenant comes from the caller's
 * active super_organizer Membership in an approved Tenant (never the client), and a donation or
 * conflict counts as theirs only when its Event's tenantId is that Tenant (FR-2). Everyone
 * else — co-Organizer, Operator, Admin, another tenant — is refused. Every change is audited
 * with the tenantId, so it shows in the company's own activity log (FR-15).
 *
 * ClientCtor/AccountCtor/DatabasesCtor are injectable so tests can substitute fakes.
 */
export async function handleTenantDonationsRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  DatabasesCtor = TablesDB,
}) {
  const request = await prepareOrganizerRequest({
    req,
    ClientCtor,
    AccountCtor,
    error,
    validators: PAYLOAD_VALIDATORS,
    tableIds: requiredTableIds(),
  });
  if (request.errorResponse) {
    return res.json(request.errorResponse.body, request.errorResponse.status);
  }
  const result = await ACTION_HANDLERS[request.action]({
    DatabasesCtor,
    adminClient: request.adminClient,
    payload: request.payload,
    caller: request.caller,
    error,
  });
  if (result.status === 200) {
    log(`${request.action} succeeded (by super organizer ${request.caller.$id})`);
  }
  return res.json(result.body, result.status);
}

function requiredTableIds() {
  return [
    process.env.APPWRITE_DATABASE_ID,
    process.env.APPWRITE_EVENTS_COLLECTION_ID,
    process.env.APPWRITE_DONATIONS_COLLECTION_ID,
    process.env.APPWRITE_DONATION_CONFLICTS_COLLECTION_ID,
    process.env.APPWRITE_TENANTS_COLLECTION_ID,
    process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID,
  ];
}

export { ACTIONS as TENANT_DONATION_ACTIONS };
