import { Query } from 'node-appwrite';
import { listAllRows } from '../shared.js';
import { recomputeTenantReadGrants } from '../tenant-grants.js';
import { alertAdminsOfFailedSweep } from './sweep-alert.js';
import { identityTables, isIdentityCheckConfigured } from './identity-check.js';
import { handleRevokeMembership } from './revocation.js';
import { grantTeamMemberAccess } from './team-members.js';
import { PENDING_REVIEW_STATUS, ROUTINE_REVOCATION } from './validation.js';

// The review states still waiting on Admin: a flagged addition, or a co-Organizer addition
// Admin hasn't yet seen (FR-12 notifies on every one, match or not).
export const QUEUED_REVIEW_STATUSES = ['open', 'unmatched'];

const DECISION_OUTCOMES = {
  confirm: { from: 'open', to: 'confirmed' },
  clear: { from: 'open', to: 'cleared' },
  acknowledge: { from: 'unmatched', to: 'acknowledged' },
};

const MISCONFIGURED = {
  status: 500,
  body: { error: 'Server misconfiguration: missing identity review table IDs' },
};

/** Story 7.2: Admin's queue for the Approvals screen's "Flagged additions" tab. */
export async function handleListIdentityReviews({ DatabasesCtor, adminClient, databaseId, error }) {
  if (!isIdentityCheckConfigured()) {
    return MISCONFIGURED;
  }
  try {
    const rows = await listAllRows({
      DatabasesCtor,
      adminClient,
      databaseId,
      tableId: identityTables().reviewsTableId,
      queries: [Query.equal('status', QUEUED_REVIEW_STATUSES), Query.orderDesc('createdAt')],
    });
    return { status: 200, body: { success: true, reviews: rows.map(toReviewView) } };
  } catch (err) {
    error(`listIdentityReviews: lookup failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to load flagged additions' } };
  }
}

function toReviewView(row) {
  return {
    reviewId: row.$id,
    membershipId: row.membershipId,
    tenantId: row.tenantId,
    tenantName: row.tenantName ?? null,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    role: row.role,
    matched: row.matched,
    matches: JSON.parse(row.matches ?? '[]'),
    status: row.status,
    createdAt: row.createdAt,
  };
}

/**
 * Story 7.2: Admin's decision on one review. Confirming a real match revokes the Membership
 * through the ordinary revoke path; clearing a false positive activates it and grants its
 * access through the ordinary add path. Neither writes IdentityFlags — a for-cause flag is a
 * tenant's own revoke decision (Story 7.3) — and a clearance touches only this one review and
 * Membership, so the same identity added at another tenant is screened and reviewed afresh.
 */
export async function handleResolveIdentityReview(context) {
  if (!isIdentityCheckConfigured()) {
    return MISCONFIGURED;
  }
  const { payload } = context;
  const review = await loadReview(context);
  if (review.errorResponse) {
    return review.errorResponse;
  }
  const outcome = DECISION_OUTCOMES[payload.decision];
  if (review.row.status !== outcome.from) {
    return { status: 409, body: { error: `This review is ${review.row.status}` } };
  }
  const applied = await DECISION_EFFECTS[payload.decision]({ ...context, review: review.row });
  if (applied.status !== 200) {
    return applied;
  }
  return markReviewResolved({ ...context, reviewId: review.row.$id, status: outcome.to });
}

async function loadReview({ DatabasesCtor, adminClient, databaseId, payload, error }) {
  try {
    const row = await new DatabasesCtor(adminClient).getRow({
      databaseId,
      tableId: identityTables().reviewsTableId,
      rowId: payload.reviewId,
    });
    return { row };
  } catch (err) {
    error(`resolveIdentityReview: review ${payload.reviewId} not found: ${err.message}`);
    return { errorResponse: { status: 404, body: { error: 'Review not found' } } };
  }
}

const DECISION_EFFECTS = {
  confirm: revokeConfirmedMembership,
  clear: activateClearedMembership,
  acknowledge: async () => ({ status: 200 }),
};

/**
 * Routine, not for-cause: the match itself already sits on IdentityFlags or the tenant's own
 * history, and a same-tenant match is no fraud signal by itself (FR-24). A for-cause flag stays
 * a tenant's own decision, with its explanation and flaggedByTenantId.
 */
function revokeConfirmedMembership(context) {
  return handleRevokeMembership({
    ...context,
    payload: { membershipId: context.review.membershipId, reason: ROUTINE_REVOCATION },
    team: { callerRole: null },
  });
}

/**
 * Re-runnable: a retry after a failed grant finds the Membership already active and just
 * grants again. One the adder revoked while it waited is never brought back.
 */
async function activateClearedMembership(context) {
  const { review, error } = context;
  let membership;
  try {
    membership = await loadMembership(context);
    if (membership.status === 'revoked') {
      return { status: 200 };
    }
    await activateMembership({ ...context, membership });
  } catch (err) {
    error(`resolveIdentityReview: activating ${review.membershipId} failed: ${err.message}`);
    return { status: 502, body: { error: 'Failed to activate the membership' } };
  }
  return grantClearedMemberAccess({ ...context, membership });
}

function loadMembership({
  DatabasesCtor,
  adminClient,
  databaseId,
  membershipsCollectionId,
  review,
}) {
  return new DatabasesCtor(adminClient).getRow({
    databaseId,
    tableId: membershipsCollectionId,
    rowId: review.membershipId,
  });
}

async function activateMembership(context) {
  const { DatabasesCtor, adminClient, databaseId, membershipsCollectionId, membership } = context;
  if (membership.status !== PENDING_REVIEW_STATUS) {
    return;
  }
  await new DatabasesCtor(adminClient).updateRow({
    databaseId,
    tableId: membershipsCollectionId,
    rowId: membership.$id,
    data: { status: 'active' },
  });
}

async function grantClearedMemberAccess(context) {
  const { membership, error } = context;
  const accessGranted = await grantTeamMemberAccess({
    ...context,
    tenantId: membership.tenantId,
    userId: membership.userId,
    role: membership.role,
  });
  const grants = await recomputeTenantReadGrants({ ...context, tenantId: membership.tenantId });
  if (accessGranted && grants.ok) {
    return { status: 200 };
  }
  if (!grants.ok) {
    await alertAdminsOfFailedSweep({ ...context, tenantId: membership.tenantId, grants });
  }
  error(`resolveIdentityReview: access grant incomplete for ${membership.$id}`);
  return {
    status: 502,
    body: { error: 'Membership was activated, but granting its access failed — retry', grants },
  };
}

async function markReviewResolved({
  DatabasesCtor,
  adminClient,
  databaseId,
  caller,
  reviewId,
  status,
  error,
}) {
  try {
    await new DatabasesCtor(adminClient).updateRow({
      databaseId,
      tableId: identityTables().reviewsTableId,
      rowId: reviewId,
      data: { status, reviewedBy: caller.$id, reviewedAt: new Date().toISOString() },
    });
  } catch (err) {
    error(`resolveIdentityReview: marking ${reviewId} ${status} failed: ${err.message}`);
    return {
      status: 502,
      body: { error: 'The decision was applied, but saving the review failed' },
    };
  }
  return { status: 200, body: { success: true, reviewId, status } };
}
