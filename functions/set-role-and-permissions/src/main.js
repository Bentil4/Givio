import { handleAdminUsersRequest } from './admin-users.js';
import { handleEventAssignmentRequest, EVENT_ASSIGNMENT_ACTIONS } from './event-assignment.js';
import {
  handleDonationRecordingRequest,
  DONATION_RECORDING_ACTIONS,
} from './donation-recording.js';
import { handleFamilyAccessRequest, FAMILY_ACCESS_ACTIONS } from './family-access.js';
import { handleTenantMembershipRequest, TENANT_MEMBERSHIP_ACTIONS } from './tenant-membership.js';
import { handleTenantGrantsRequest, TENANT_GRANT_ACTIONS } from './tenant-grants.js';
import { handleSupportRequestsRequest, SUPPORT_REQUEST_ACTIONS } from './support-requests.js';
import { handleSupportInboxRequest, SUPPORT_INBOX_ACTIONS } from './support-inbox.js';
import { handleTenantEventsRequest, TENANT_EVENT_ACTIONS } from './tenant-events.js';
import { handleDuplicateEventsRequest, DUPLICATE_EVENT_ACTIONS } from './duplicate-events.js';
import { handleTenantAuditRequest, TENANT_AUDIT_ACTIONS } from './tenant-audit.js';
import { handleTenantDonationsRequest, TENANT_DONATION_ACTIONS } from './tenant-donations.js';
import { handleApprovalCountsRequest, APPROVAL_COUNT_ACTIONS } from './approval-counts.js';
import { handleAuditLogGrantsRequest, AUDIT_LOG_GRANT_ACTIONS } from './audit-log-grants.js';

/**
 * One deployed Function, routed by `action` in the request body — all seven modules share the
 * same "sole trusted writer" role (AD-9): admin-users.js for user Labels, event-assignment.js
 * for Event.assignedUserIds and the Appwrite permissions derived from it (AD-2),
 * donation-recording.js for creating a Donation with those same derived permissions
 * (Story 3.1), conflict-resolution.js for resolving existing sync conflicts (Story 3.5),
 * family-access.js for the Family access-code flow (Story 2.4) — the one module with a
 * genuinely public, unauthenticated action (resolveAccessCode), since a Family Member has no
 * account at all (AD-10) — and tenant-membership.js for Memberships/Tenant status (AD-1/AD-9
 * amended, Story 6.2), plus tenant-grants.js's Admin backfill of AD-2's tenant-wide read grants.
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
  if (FAMILY_ACCESS_ACTIONS.includes(action)) {
    return handleFamilyAccessRequest(context);
  }
  if (TENANT_MEMBERSHIP_ACTIONS.includes(action)) {
    return handleTenantMembershipRequest(context);
  }
  if (TENANT_GRANT_ACTIONS.includes(action)) {
    return handleTenantGrantsRequest(context);
  }
  if (SUPPORT_REQUEST_ACTIONS.includes(action)) {
    return handleSupportRequestsRequest(context);
  }
  if (SUPPORT_INBOX_ACTIONS.includes(action)) {
    return handleSupportInboxRequest(context);
  }
  if (TENANT_EVENT_ACTIONS.includes(action)) {
    return handleTenantEventsRequest(context);
  }
  if (DUPLICATE_EVENT_ACTIONS.includes(action)) {
    return handleDuplicateEventsRequest(context);
  }
  if (TENANT_AUDIT_ACTIONS.includes(action)) {
    return handleTenantAuditRequest(context);
  }
  if (TENANT_DONATION_ACTIONS.includes(action)) {
    return handleTenantDonationsRequest(context);
  }
  if (APPROVAL_COUNT_ACTIONS.includes(action)) {
    return handleApprovalCountsRequest(context);
  }
  if (AUDIT_LOG_GRANT_ACTIONS.includes(action)) {
    return handleAuditLogGrantsRequest(context);
  }
  // Falls through to admin-users.js for everything else, including an unrecognized action —
  // that module's own validatePayload() is what turns an unknown action into a 400.
  return handleAdminUsersRequest(context);
};
