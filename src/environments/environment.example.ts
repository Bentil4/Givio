// Copy this file to environment.ts (and environment.development.ts) and fill in real values.
// Both are gitignored — they hold deploy-specific IDs and are never committed.
export const environment: {
  appwriteEndpoint: string;
  appwriteProjectId: string;
  appwriteProjectName: string;
  setRoleFunctionId: string;
} = {
  appwriteEndpoint: 'https://fra.cloud.appwrite.io/v1',
  appwriteProjectId: 'YOUR_APPWRITE_PROJECT_ID',
  appwriteProjectName: 'Givio',
  // The deployed functions/set-role-and-permissions function ID (Console → Functions → click the function → $id).
  setRoleFunctionId: 'YOUR_DEPLOYED_SET_ROLE_FUNCTION_ID'
};
