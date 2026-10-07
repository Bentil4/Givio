import { companyIdentityData } from './onboarding.js';
import { auditProfileChange, profileChange } from './company-profile-audit.js';

const FORBIDDEN = { status: 403, body: { error: 'Forbidden' } };

/**
 * The company's own profile — name, location, contact phone and logo — edited by its Super
 * Organizer only. Co-Organizers pass the team scope (resolveTeamScope) because they may read
 * these details, but never change them. Only the caller's own Tenant row is written, and only
 * these fields: validation already refused every server-owned trust field. Every change is
 * recorded in the company's own activity log.
 */
export async function handleUpdateCompanyProfile(context) {
  const { DatabasesCtor, adminClient, payload, team, databaseId, tenantsCollectionId, error } =
    context;
  if (team.callerRole !== 'super_organizer') {
    return FORBIDDEN;
  }
  try {
    const databases = new DatabasesCtor(adminClient);
    const target = { databaseId, tableId: tenantsCollectionId, rowId: team.tenantId };
    const before = await databases.getRow(target);
    const row = await databases.updateRow({ ...target, data: companyProfileRowData(payload) });
    const change = profileChange({ before, after: row });
    await auditProfileChange({ ...context, change, tenantId: team.tenantId });
    return { status: 200, body: { success: true, tenant: companyProfileOf(row) } };
  } catch (err) {
    error(`updateCompanyProfile: tenant ${team.tenantId} update failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to update the company profile' } };
  }
}

// An omitted contact phone clears it (the form always sends the whole profile); an omitted
// logo leaves it untouched, and null removes it.
function companyProfileRowData(payload) {
  return {
    contactPhone: null,
    ...companyIdentityData(payload),
    ...(payload.logo === undefined ? {} : { logo: payload.logo }),
  };
}

function companyProfileOf(row) {
  return {
    name: row.name,
    location: row.location,
    contactPhone: row.contactPhone ?? null,
    logo: row.logo ?? null,
  };
}
