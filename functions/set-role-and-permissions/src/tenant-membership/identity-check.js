import { ID, Query } from 'node-appwrite';
import { hasValue, listAllRows, normalizePhone } from '../shared.js';
import { PENDING_REVIEW_STATUS } from './validation.js';

// Bounds the review row's JSON snapshot; a candidate matching more entries than this is
// already unambiguous for Admin, and the row's `matched` flag still says so.
const MAX_STORED_MATCHES = 50;

/**
 * Story 7.2 (FR-12/FR-23): screens an Organizer-tier caller's team addition before the
 * Membership is written. Every addition runs the platform-wide IdentityFlags cross-reference;
 * an Operator addition also runs the same-tenant check. A match makes the Membership
 * `pending_review` (no access at all until Admin clears it); a co-Organizer addition is
 * recorded for Admin whether or not it matched. Admin's own additions are not screened —
 * Admin is the reviewer. Fails closed: a failed lookup, or an environment without the identity
 * tables, refuses the addition before any Account exists.
 * Returns `{ membershipStatus, matches, reviewNeeded }` or `{ errorResponse }`.
 */
export async function screenTeamAddition(context) {
  const { team, role, error } = context;
  if (team.callerRole === null) {
    return unscreened();
  }
  if (!isIdentityCheckConfigured()) {
    error('addTeamMember: identity check impossible — IdentityFlags/review tables not configured');
    return SCREENING_FAILED;
  }
  try {
    const matches = await findIdentityMatches(context);
    return {
      membershipStatus: matches.length > 0 ? PENDING_REVIEW_STATUS : 'active',
      matches,
      reviewNeeded: matches.length > 0 || role === 'organizer',
    };
  } catch (err) {
    error(`addTeamMember: identity check failed: ${err.message}`);
    return SCREENING_FAILED;
  }
}

// Deliberately the same generic refusal whatever went wrong: nothing about a check is revealed.
const SCREENING_FAILED = {
  errorResponse: { status: 502, body: { error: 'Failed to add team member' } },
};

function unscreened() {
  return { membershipStatus: 'active', matches: [], reviewNeeded: false };
}

/**
 * Writes Admin's review record for a screened addition. Returns false when the write failed —
 * the caller reports that as `setupIncomplete`, which reads the same as any other access-setup
 * failure and so never tells the adder a check happened.
 */
export async function recordScreeningReview({
  DatabasesCtor,
  adminClient,
  databaseId,
  screening,
  addition,
  error,
}) {
  if (!screening.reviewNeeded) {
    return true;
  }
  try {
    await new DatabasesCtor(adminClient).createRow({
      databaseId,
      tableId: identityTables().reviewsTableId,
      rowId: ID.unique(),
      data: buildReviewRow(addition, screening.matches),
    });
    return true;
  } catch (err) {
    error(`addTeamMember: review write failed for ${addition.membershipId}: ${err.message}`);
    return false;
  }
}

function buildReviewRow(addition, matches) {
  return {
    ...addition,
    phone: hasValue(addition.phone) ? addition.phone : null,
    matched: matches.length > 0,
    matches: JSON.stringify(matches.slice(0, MAX_STORED_MATCHES)),
    status: matches.length > 0 ? 'open' : 'unmatched',
    createdAt: new Date().toISOString(),
  };
}

export function identityTables() {
  return {
    flagsTableId: process.env.APPWRITE_IDENTITY_FLAGS_COLLECTION_ID,
    reviewsTableId: process.env.APPWRITE_IDENTITY_REVIEWS_COLLECTION_ID,
  };
}

export function isIdentityCheckConfigured() {
  const { flagsTableId, reviewsTableId } = identityTables();
  return hasValue(flagsTableId) && hasValue(reviewsTableId);
}

async function findIdentityMatches(context) {
  const identity = normalizeIdentity(context.candidate);
  const flagMatches = await findFlagMatches({ ...context, identity });
  if (context.role !== 'operator') {
    return flagMatches;
  }
  const sameTenantMatches = await findSameTenantMatches({ ...context, identity });
  return [...flagMatches, ...sameTenantMatches];
}

/**
 * The canonical comparable form of a person. Story 7.3 must write IdentityFlags rows in this
 * form — the lookup below is an exact-equality query on it. Exact rather than fuzzy on
 * purpose: a fuzzy name match would flag most common names, and every flag costs an innocent
 * person a silent wait for Admin; email and phone already catch a re-attempt under a respelled
 * name.
 */
export function normalizeIdentity({ name, email, phone }) {
  return {
    name: hasValue(name) ? name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : null,
    email: hasValue(email) ? email.trim().toLowerCase() : null,
    phone: hasValue(phone) ? normalizePhone(phone) : null,
  };
}

function matchedFields(identity, other) {
  return Object.keys(identity).filter(
    (field) => identity[field] !== null && identity[field] === other[field],
  );
}

async function findFlagMatches({ DatabasesCtor, adminClient, databaseId, identity }) {
  const flags = await listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId,
    tableId: identityTables().flagsTableId,
    queries: [Query.or(identityQueries(identity))],
  });
  // Re-checked in memory so a query that matched loosely can never flag anyone.
  return flags
    .map((flag) => toFlagMatch(flag, identity))
    .filter((match) => match.fields.length > 0);
}

function identityQueries(identity) {
  return Object.entries(identity)
    .filter(([, value]) => value !== null)
    .map(([field, value]) => Query.equal(field, [value]));
}

function toFlagMatch(flag, identity) {
  return {
    source: 'identity_flag',
    id: flag.$id,
    fields: matchedFields(identity, normalizeIdentity(flag)),
    name: flag.name,
    email: flag.email ?? null,
    phone: flag.phone ?? null,
    reason: flag.reason,
    sourceType: flag.sourceType,
    flaggedAt: flag.flaggedAt,
    flaggedByTenantId: flag.flaggedByTenantId ?? null,
  };
}

/** FR-23's extra layer: anyone who holds, or ever held, a Membership at this tenant. */
async function findSameTenantMatches({
  DatabasesCtor,
  UsersCtor,
  adminClient,
  databaseId,
  membershipsCollectionId,
  team,
  identity,
}) {
  const memberships = await listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId,
    tableId: membershipsCollectionId,
    queries: [Query.equal('tenantId', [team.tenantId])],
  });
  const users = new UsersCtor(adminClient);
  const people = await Promise.all(
    memberships
      .filter((membership) => membership.tenantId === team.tenantId)
      .map(async (membership) => ({
        membership,
        account: await users.get({ userId: membership.userId }),
      })),
  );
  return people
    .map((person) => toSameTenantMatch(person, identity))
    .filter((match) => match.fields.length > 0);
}

function toSameTenantMatch({ membership, account }, identity) {
  return {
    source: 'same_tenant',
    id: membership.$id,
    fields: matchedFields(identity, normalizeIdentity(account)),
    name: account.name,
    email: account.email,
    phone: hasValue(account.phone) ? account.phone : null,
    role: membership.role,
    status: membership.status,
  };
}
