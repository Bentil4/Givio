import { handleAdminUsersRequest } from './admin-users.js';
import { handleEventAssignmentRequest, EVENT_ASSIGNMENT_ACTIONS } from './event-assignment.js';
import { handleDonationRecordingRequest, DONATION_RECORDING_ACTIONS } from './donation-recording.js';
import { handleConflictResolutionRequest, CONFLICT_RESOLUTION_ACTIONS } from './conflict-resolution.js';
import { handleFamilyAccessRequest, FAMILY_ACCESS_ACTIONS } from './family-access.js';

/**
 * One deployed Function, routed by `action` in the request body — all five modules share the
 * same "sole trusted writer" role (AD-9): admin-users.js for user Labels, event-assignment.js
 * for Event.assignedUserIds and the Appwrite permissions derived from it (AD-2),
 * donation-recording.js for creating a Donation with those same derived permissions
 * (Story 3.1), conflict-resolution.js for filing/resolving sync conflicts (Story 3.5),
 * family-access.js for the Family access-code flow (Story 2.4) — the one module with a
 * genuinely public, unauthenticated action (resolveAccessCode), since a Family Member has no
 * account at all (AD-10).
 */
export default async (context) => {
  let action;
  try {
    action = JSON.parse(context.req.bodyRaw || '{}').action;
  } catch {
    action = undefined;
  }

  if (EVENT_ASSIGNMENT_ACTIONS.includes(action)) {
    return handleEventAssignmentRequest(context);
  }
  if (DONATION_RECORDING_ACTIONS.includes(action)) {
    return handleDonationRecordingRequest(context);
  }
  if (CONFLICT_RESOLUTION_ACTIONS.includes(action)) {
    return handleConflictResolutionRequest(context);
  }
  if (FAMILY_ACCESS_ACTIONS.includes(action)) {
    return handleFamilyAccessRequest(context);
  }
  // Falls through to admin-users.js for everything else, including an unrecognized action —
  // that module's own validatePayload() is what turns an unknown action into a 400.
  return handleAdminUsersRequest(context);
};
