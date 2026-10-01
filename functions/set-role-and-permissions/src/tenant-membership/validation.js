import { VALID, invalid, hasValue, isValidEmail, isValidPhone, normalizePhone } from '../shared.js';

export const ACTIONS = [
  'createMembership',
  'revokeMembership',
  'setTenantStatus',
  'addTeamMember',
  'inviteOrganizer',
  'submitTenantApplication',
  'listTeamMembers',
  'recordTenantVerification',
  'listIdentityReviews',
  'resolveIdentityReview',
];

// Story 7.2: a screened team addition that matched waits here, with no access, until Admin
// clears it (→ active) or confirms it (→ revoked).
export const PENDING_REVIEW_STATUS = 'pending_review';

export const IDENTITY_REVIEW_DECISIONS = ['confirm', 'clear', 'acknowledge'];

// Story 7.3 (FR-13/FR-24): every revoke states which kind it is — never one generic "revoke".
// Keep in sync with src/app/data/models/team-member.ts's RevocationReason.
export const ROUTINE_REVOCATION = 'routine';
export const FOR_CAUSE_REVOCATION = 'for_cause';
const REVOCATION_REASONS = [ROUTINE_REVOCATION, FOR_CAUSE_REVOCATION];
// Stored as the IdentityFlags row's `reason` (live column size 1000), and read only by Admin.
const REVOCATION_EXPLANATION_MAX = 500;

// Keep in sync with src/app/data/models/tenant.ts's TENANT_SIZES/TENANT_TYPES — separate
// deployments with no shared module system, same arrangement as VALID_ROLES in shared.js.
export const TENANT_SIZES = ['1-10', '11-50', '51-200', '201+'];
export const TENANT_TYPES = ['funeral', 'wedding', 'funeral_and_wedding', 'other'];
const TENANT_TEXT_MAX = 128;
const MAX_ESTIMATED_USERS = 100000;

// A self-signup applicant must never be able to choose their own trust state.
const SERVER_OWNED_TENANT_FIELDS = [
  'status',
  'role',
  'superOrganizerId',
  'verifiedBy',
  'verifiedAt',
  'tenantId',
  'userId',
  'createdAt',
];

const MEMBERSHIP_ROLES = ['super_organizer', 'organizer', 'operator'];

const TENANT_STATUSES = ['approved', 'rejected', 'suspended'];

const TEAM_MEMBER_ROLES = ['organizer', 'operator'];

export function validatePayload(action, payload, callerContext) {
  const validator = PAYLOAD_VALIDATORS[action];
  if (!validator) {
    return invalid(`action must be one of: ${ACTIONS.join(', ')}`);
  }
  return validator(payload ?? {}, callerContext);
}

/**
 * FR-7's approval precondition: every intake field from the signup wizard is present and
 * valid, including the verification document (FR-8). Story 6.5's approval UI reads the same
 * answer; setTenantStatus enforces it so a direct call can't approve an incomplete intake.
 */
export function isTenantIntakeComplete(tenant) {
  return (
    validateCompanyIntake({
      name: tenant?.name,
      location: tenant?.location,
      size: tenant?.size,
      type: tenant?.type,
      estimatedUserCount: tenant?.estimatedUserCount,
    }).valid && hasValue(tenant?.verificationDocumentId)
  );
}

const PAYLOAD_VALIDATORS = {
  createMembership: ({ userId, tenantId, role }) => {
    if (!hasValue(userId) || !hasValue(tenantId)) {
      return invalid('Request must include userId and tenantId');
    }
    if (!MEMBERSHIP_ROLES.includes(role)) {
      return invalid(`role must be one of: ${MEMBERSHIP_ROLES.join(', ')}`);
    }
    return VALID;
  },
  revokeMembership: ({ membershipId, reason, explanation }) => {
    if (!hasValue(membershipId)) {
      return invalid('Request must include membershipId');
    }
    if (!REVOCATION_REASONS.includes(reason)) {
      return invalid(`reason must be one of: ${REVOCATION_REASONS.join(', ')}`);
    }
    return reason === FOR_CAUSE_REVOCATION ? validateForCauseExplanation(explanation) : VALID;
  },
  setTenantStatus: ({ tenantId, status }) => {
    if (!hasValue(tenantId)) {
      return invalid('Request must include tenantId');
    }
    if (!TENANT_STATUSES.includes(status)) {
      return invalid(`status must be one of: ${TENANT_STATUSES.join(', ')}`);
    }
    return VALID;
  },
  addTeamMember: ({ name, email, phone, tenantId, role }, { isAdmin }) => {
    if (!hasValue(name) || !hasValue(email)) {
      return invalid('Request must include name and email');
    }
    if (isAdmin && !hasValue(tenantId)) {
      return invalid('Request must include tenantId');
    }
    if (!isValidEmail(email)) {
      return invalid('email must be a valid email address');
    }
    if (!TEAM_MEMBER_ROLES.includes(role)) {
      return invalid(`role must be one of: ${TEAM_MEMBER_ROLES.join(', ')}`);
    }
    return validateOptionalPhone(phone);
  },
  listTeamMembers: ({ tenantId }, { isAdmin }) => {
    if (isAdmin && !hasValue(tenantId)) {
      return invalid('Request must include tenantId');
    }
    return VALID;
  },
  listIdentityReviews: () => VALID,
  resolveIdentityReview: ({ reviewId, decision }) => {
    if (!hasValue(reviewId)) {
      return invalid('Request must include reviewId');
    }
    if (!IDENTITY_REVIEW_DECISIONS.includes(decision)) {
      return invalid(`decision must be one of: ${IDENTITY_REVIEW_DECISIONS.join(', ')}`);
    }
    return VALID;
  },
  inviteOrganizer: ({ name, email, company }) => {
    if (!hasValue(name) || !hasValue(email)) {
      return invalid('Request must include name and email');
    }
    if (!isValidEmail(email)) {
      return invalid('email must be a valid email address');
    }
    return validateCompanyContact(company, { phoneRequired: false });
  },
  recordTenantVerification: ({ tenantId, documentReviewed, phoneVerified }) => {
    if (!hasValue(tenantId)) {
      return invalid('Request must include tenantId');
    }
    if (documentReviewed !== true || phoneVerified !== true) {
      return invalid('Verification needs both the document review and the phone call confirmed');
    }
    return VALID;
  },
  submitTenantApplication: (payload) => {
    const smuggled = SERVER_OWNED_TENANT_FIELDS.filter(
      (field) =>
        field in payload ||
        (typeof payload.company === 'object' &&
          payload.company !== null &&
          field in payload.company),
    );
    if (smuggled.length > 0) {
      return invalid(`Request must not include: ${smuggled.join(', ')}`);
    }
    if (!hasValue(payload.verificationDocumentId)) {
      return invalid('Request must include verificationDocumentId');
    }
    return validateCompanyContact(payload.company, { phoneRequired: true });
  },
};

// contactPhone is checked here rather than in validateCompanyIntake so the approval
// precondition below still passes for applications submitted before the field existed.
function validateCompanyContact(company, { phoneRequired }) {
  const intake = validateCompanyIntake(company);
  if (!intake.valid) {
    return intake;
  }
  const { contactPhone } = company;
  if (contactPhone === undefined || contactPhone === null || contactPhone === '') {
    return phoneRequired ? invalid('company.contactPhone is required') : VALID;
  }
  if (typeof contactPhone !== 'string' || !isValidPhone(normalizePhone(contactPhone))) {
    return invalid(
      'company.contactPhone must be an international phone number, e.g. +233241234567',
    );
  }
  return VALID;
}

function validateForCauseExplanation(explanation) {
  const trimmed = typeof explanation === 'string' ? explanation.trim() : '';
  if (trimmed.length === 0 || trimmed.length > REVOCATION_EXPLANATION_MAX) {
    return invalid(
      `A for-cause revocation needs an explanation (max ${REVOCATION_EXPLANATION_MAX} characters)`,
    );
  }
  return VALID;
}

// Story 7.2: only read by the identity check, never stored on the Account.
function validateOptionalPhone(phone) {
  if (phone === undefined || phone === null || phone === '') {
    return VALID;
  }
  if (typeof phone !== 'string' || !isValidPhone(normalizePhone(phone))) {
    return invalid('phone must be an international phone number, e.g. +233241234567');
  }
  return VALID;
}

function validateCompanyIntake(company) {
  if (typeof company !== 'object' || company === null) {
    return invalid('Request must include company');
  }
  const { name, location, size, type, estimatedUserCount } = company;
  for (const [field, value] of [
    ['name', name],
    ['location', location],
  ]) {
    if (!hasValue(value?.trim?.()) || value.trim().length > TENANT_TEXT_MAX) {
      return invalid(`company.${field} is required (max ${TENANT_TEXT_MAX} characters)`);
    }
  }
  if (!TENANT_SIZES.includes(size)) {
    return invalid(`company.size must be one of: ${TENANT_SIZES.join(', ')}`);
  }
  if (!TENANT_TYPES.includes(type)) {
    return invalid(`company.type must be one of: ${TENANT_TYPES.join(', ')}`);
  }
  if (
    !Number.isInteger(estimatedUserCount) ||
    estimatedUserCount < 1 ||
    estimatedUserCount > MAX_ESTIMATED_USERS
  ) {
    return invalid(
      `company.estimatedUserCount must be a whole number from 1 to ${MAX_ESTIMATED_USERS}`,
    );
  }
  return VALID;
}
