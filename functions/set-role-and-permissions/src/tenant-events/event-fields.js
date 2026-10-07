import { VALID, invalid, hasValue } from '../shared.js';

const EVENT_TYPES = ['wedding', 'funeral'];

export const EVENT_STATUSES = ['active', 'paused', 'closed'];

// Story 2.2: pause/resume/close are the forward transitions; a Closed event can only be
// reopened back to Active, never straight to Paused — it must be resumed first.
const ALLOWED_TRANSITIONS = {
  active: ['paused', 'closed'],
  paused: ['active', 'closed'],
  closed: ['active'],
};

// The original event form's limits, inside the events table's column sizes (name/hostName
// 128, venue/description/notes 1024, image 500000).
const TEXT_LIMITS = {
  name: { min: 3, max: 120 },
  hostName: { min: 1, max: 120 },
  venue: { min: 0, max: 160 },
  description: { min: 0, max: 1024 },
  notes: { min: 0, max: 1024 },
  image: { min: 0, max: 500000 },
};
const REQUIRED_TEXT_FIELDS = ['name', 'hostName'];
const OPTIONAL_TEXT_FIELDS = ['venue', 'description', 'notes', 'image'];

// The only fields an Organizer may set. Type is fixed after creation (Story 2.1); status has
// its own action; tenantId, createdBy, assignedUserIds and accessCode are server-owned.
const EDITABLE_FIELDS = ['name', 'date', 'hostName', ...OPTIONAL_TEXT_FIELDS];

export const PAYLOAD_VALIDATORS = {
  createTenantEvent: validateNewEventDetails,
  updateTenantEvent: (payload) => firstInvalid([requireEventId(payload), validatePatch(payload)]),
  setTenantEventStatus: (payload) =>
    firstInvalid([requireEventId(payload), validateStatus(payload)]),
};

/** Story 2.2's transition rule: an error message, or null when `from` may become `to`. */
export function statusTransitionError(from, to) {
  if (from === to) {
    return `Event is already ${to}`;
  }
  if (!(ALLOWED_TRANSITIONS[from] ?? []).includes(to)) {
    return `Cannot change status from ${from} to ${to}`;
  }
  return null;
}

/** The editable fields present in the payload, with blank optional text cleared to null. */
export function pickEventDetails(payload) {
  const present = EDITABLE_FIELDS.filter((field) => payload[field] !== undefined);
  return Object.fromEntries(present.map((field) => [field, normalizedValue(field, payload)]));
}

function normalizedValue(field, payload) {
  const value = payload[field];
  return OPTIONAL_TEXT_FIELDS.includes(field) && value === '' ? null : value;
}

function validateNewEventDetails(payload) {
  if (!EVENT_TYPES.includes(payload.type)) {
    return invalid(`type must be one of: ${EVENT_TYPES.join(', ')}`);
  }
  const missing = ['name', 'date', 'hostName'].filter((field) => !hasValue(payload[field]));
  if (missing.length > 0) {
    return invalid(`Request must include ${missing.join(', ')}`);
  }
  return validatePresentDetails(payload);
}

function validatePatch(payload) {
  if (Object.keys(pickEventDetails(payload)).length === 0) {
    return invalid(`Request must include at least one of: ${EDITABLE_FIELDS.join(', ')}`);
  }
  return validatePresentDetails(payload);
}

function validatePresentDetails(payload) {
  const textChecks = Object.keys(TEXT_LIMITS)
    .filter((field) => payload[field] !== undefined)
    .map((field) => validateText(field, payload[field]));
  const dateCheck = payload.date === undefined ? VALID : validateDate(payload.date);
  return firstInvalid([...textChecks, dateCheck]);
}

function validateText(field, value) {
  const { min, max } = TEXT_LIMITS[field];
  const allowsBlank = !REQUIRED_TEXT_FIELDS.includes(field) && value === null;
  if (allowsBlank) {
    return VALID;
  }
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    return invalid(`${field} must be text of ${min}-${max} characters`);
  }
  return VALID;
}

function validateDate(date) {
  return hasValue(date) && !Number.isNaN(Date.parse(date))
    ? VALID
    : invalid('date must be a valid date');
}

function requireEventId({ eventId }) {
  return hasValue(eventId) ? VALID : invalid('Request must include eventId');
}

function validateStatus({ status }) {
  return EVENT_STATUSES.includes(status)
    ? VALID
    : invalid(`Request must include status as one of: ${EVENT_STATUSES.join(', ')}`);
}

function firstInvalid(results) {
  return results.find((result) => !result.valid) ?? VALID;
}
