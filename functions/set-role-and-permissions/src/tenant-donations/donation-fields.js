import { VALID, invalid, hasValue } from '../shared.js';
import { DONATION_TYPES } from '../donation-recording.js';
import { RESOLUTIONS } from '../conflict-resolution.js';

// The same limits Admin's correction form enforces (admin-donations.ts): a donor name of at
// least 2 characters, an amount of up to GH₵ 9,999,999.99 in pesewas, and a reason long enough
// to be a sentence rather than "typo" — it is what makes a changed total defensible later.
const DONOR_NAME_MIN = 2;
const AMOUNT_MINOR_MAX = 999_999_999;
const REASON_MIN = 10;

// The only fields a correction may touch — the same four Admin's updateDonation accepts.
// Receipt number, phone, recorder and timestamps are the record of what happened at the desk.
const EDITABLE_FIELDS = ['donorName', 'amountMinor', 'donationType', 'onBehalfOf'];

const FIELD_VALIDATORS = {
  donorName: (value) =>
    typeof value === 'string' && value.trim().length >= DONOR_NAME_MIN
      ? VALID
      : invalid(`donorName must be at least ${DONOR_NAME_MIN} characters`),
  amountMinor: (value) =>
    value === null || (Number.isInteger(value) && value >= 0 && value <= AMOUNT_MINOR_MAX)
      ? VALID
      : invalid('amountMinor must be a whole number of pesewas, or null'),
  donationType: (value) =>
    DONATION_TYPES.includes(value)
      ? VALID
      : invalid(`donationType must be one of: ${DONATION_TYPES.join(', ')}`),
  onBehalfOf: (value) =>
    value === null || typeof value === 'string'
      ? VALID
      : invalid('onBehalfOf must be text, or null'),
};

export const PAYLOAD_VALIDATORS = {
  editTenantDonation: (payload) =>
    firstInvalid([requireDonationId(payload), validatePatch(payload), requireReason(payload)]),
  softDeleteTenantDonation: (payload) =>
    firstInvalid([requireDonationId(payload), requireReason(payload)]),
  restoreTenantDonation: requireDonationId,
  listTenantConflicts: () => VALID,
  resolveTenantConflict: (payload) =>
    firstInvalid([requireConflictId(payload), validateResolution(payload)]),
};

/** The editable fields present in the patch, with a blank "on behalf of" cleared to null. */
export function pickDonationPatch(patch) {
  const present = EDITABLE_FIELDS.filter((field) => patch[field] !== undefined);
  return Object.fromEntries(present.map((field) => [field, normalizedValue(field, patch)]));
}

function normalizedValue(field, patch) {
  const value = patch[field];
  const isBlankText = typeof value === 'string' && value.trim() === '';
  return field === 'onBehalfOf' && isBlankText ? null : value;
}

function validatePatch({ patch }) {
  if (typeof patch !== 'object' || patch === null) {
    return invalid('Request must include patch as an object');
  }
  const fields = Object.keys(pickDonationPatch(patch));
  if (fields.length === 0) {
    return invalid(`patch must include at least one of: ${EDITABLE_FIELDS.join(', ')}`);
  }
  return firstInvalid(fields.map((field) => FIELD_VALIDATORS[field](patch[field])));
}

function requireReason({ reason }) {
  return typeof reason === 'string' && reason.trim().length >= REASON_MIN
    ? VALID
    : invalid(`reason must be at least ${REASON_MIN} characters`);
}

function requireDonationId({ donationId }) {
  return hasValue(donationId) ? VALID : invalid('Request must include donationId');
}

function requireConflictId({ conflictId }) {
  return hasValue(conflictId) ? VALID : invalid('Request must include conflictId');
}

function validateResolution({ resolution }) {
  return RESOLUTIONS.includes(resolution)
    ? VALID
    : invalid(`resolution must be one of: ${RESOLUTIONS.join(', ')}`);
}

function firstInvalid(results) {
  return results.find((result) => !result.valid) ?? VALID;
}
