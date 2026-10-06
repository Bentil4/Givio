import { companyIdentityData } from './onboarding.js';

const FORBIDDEN = { status: 403, body: { error: 'Forbidden' } };

/**
 * The company's own profile — name, location, contact phone and logo — edited by its Super
 * Organizer only. Co-Organizers pass the team scope (resolveTeamScope) because they may read
 * these details, but never change them. Only the caller's own Tenant row is written, and only
 * these fields: validation already refused every server-owned trust field.
 */
export async function handleUpdateCompanyProfile({
  DatabasesCtor,
  adminClient,
  payload,
  team,
  databaseId,
  tenantsCollectionId,
  error,
}) {
  if (team.callerRole !== 'super_organizer') {
    return FORBIDDEN;
  }
  try {
    const row = await new DatabasesCtor(adminClient).updateRow({
      databaseId,
      tableId: tenantsCollectionId,
      rowId: team.tenantId,
      data: companyProfileRowData(payload),
    });
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
