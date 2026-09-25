// Copy this file to environment.ts (and environment.development.ts) and fill in real values.
// Both are gitignored — they hold deploy-specific IDs and are never committed.
export const environment: {
  appwriteEndpoint: string;
  appwriteProjectId: string;
  appwriteProjectName: string;
  setRoleFunctionId: string;
  appwriteDatabaseId: string;
  eventsCollectionId: string;
  auditLogsCollectionId: string;
  donationsCollectionId: string;
  donationConflictsCollectionId: string;
  tenantsCollectionId: string;
  membershipsCollectionId: string;
  primeNgLicenseKey: string;
} = {
  appwriteEndpoint: 'https://fra.cloud.appwrite.io/v1',
  appwriteProjectId: 'YOUR_APPWRITE_PROJECT_ID',
  appwriteProjectName: 'Givio',
  // The deployed functions/set-role-and-permissions function ID (Console → Functions → click the function → $id).
  setRoleFunctionId: 'YOUR_DEPLOYED_SET_ROLE_FUNCTION_ID',
  // Console → Databases → click the database → $id.
  appwriteDatabaseId: 'YOUR_APPWRITE_DATABASE_ID',
  // Console → Databases → your database → Tables → events → $id (TablesDB; despite the
  // "CollectionId" name, this holds a Table ID — the app uses Appwrite's TablesDB/Row API).
  eventsCollectionId: 'YOUR_EVENTS_TABLE_ID',
  // Console → Databases → your database → Tables → audit_logs → $id.
  auditLogsCollectionId: 'YOUR_AUDIT_LOGS_TABLE_ID',
  // Console → Databases → your database → Tables → donations → $id.
  donationsCollectionId: 'YOUR_DONATIONS_TABLE_ID',
  // Console → Databases → your database → Tables → donation_conflicts → $id.
  donationConflictsCollectionId: 'YOUR_DONATION_CONFLICTS_TABLE_ID',
  // Console → Databases → your database → Tables → tenants → $id (Story 6.2).
  tenantsCollectionId: 'YOUR_TENANTS_TABLE_ID',
  // Console → Databases → your database → Tables → memberships → $id (Story 6.2).
  membershipsCollectionId: 'YOUR_MEMBERSHIPS_TABLE_ID',
  // Free for orgs under $1M revenue / <5 devs / <10 employees / <$3M funding, or
  // non-profits/individuals — register at https://primeui.dev/licenses/community.
  // Without a valid key, PrimeNG shows a persistent "Invalid PrimeUI License" banner.
  primeNgLicenseKey: 'YOUR_PRIMENG_LICENSE_KEY',
};
