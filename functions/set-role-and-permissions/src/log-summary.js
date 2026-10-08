// Function execution logs are readable by anyone with project access, so a success log may
// carry ids and counts only — never credentials or personal data from a response body.
const SECRET_KEY = /(password|secret|token)$/i;
const PERSONAL_KEY = /(^name|email|phone)$/i;

/**
 * A log-safe copy of a response body: secrets and personal fields redacted, an image `logo`
 * omitted, and every array reduced to its length (list actions return whole rosters).
 */
export function loggableSummary(value) {
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (isNonNullObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, loggableEntry(key, entry)]),
    );
  }
  return value;
}

function loggableEntry(key, value) {
  if (SECRET_KEY.test(key) || PERSONAL_KEY.test(key)) {
    return '[redacted]';
  }
  // A tenant logo is an image data URL — large enough to swamp the execution log.
  if (key === 'logo' && value !== null) {
    return '[omitted]';
  }
  return loggableSummary(value);
}

function isNonNullObject(value) {
  return typeof value === 'object' && value !== null;
}
