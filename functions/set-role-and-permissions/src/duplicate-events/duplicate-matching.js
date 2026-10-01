import { normalizeIdentity } from '../tenant-membership/identity-check.js';

/**
 * Story 7.4 (FR-14): the rule for "the same event or deceased individual registered twice by
 * different companies". Deliberately simple enough for Admin to reason about from a flag:
 * same event type, dates within DATE_WINDOW_DAYS, a different owner, and the same people named
 * in the Event name or host name once titles and filler words are set aside. A false positive
 * costs Admin one click (a flag never blocks creation, AD-13); a missed double-billing costs a
 * family money, so the window and the name rule lean towards flagging.
 */
export const DATE_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// Words that describe the occasion or address the person rather than identify them, so
// "Funeral of the Late Mr Kwame Mensah" and "Kwame Mensah Burial Service" compare equal.
const IGNORED_WORDS = new Set([
  ...['the', 'of', 'and', 'for', 'in', 'at', 'a', 'an'],
  ...['late', 'mr', 'mrs', 'ms', 'miss', 'madam', 'dr', 'rev', 'reverend', 'prof', 'hon', 'sir'],
  ...['funeral', 'burial', 'memorial', 'service', 'rites', 'final', 'celebration', 'life'],
  ...['thanksgiving', 'wake', 'keeping', 'one', 'week', 'remembrance', 'homegoing'],
  ...['wedding', 'marriage', 'ceremony', 'engagement', 'traditional', 'white', 'reception'],
  ...['family', 'families'],
]);

// One shared word ("Mensah") is too common a coincidence on its own; two or more is a person.
const MIN_PARTIAL_MATCH_WORDS = 2;

const COMPARED_FIELDS = ['name', 'hostName'];

/** The date range a new Event's candidates are drawn from — both ends inclusive. */
export function candidateDateRange(date) {
  const day = Date.parse(date);
  return {
    from: new Date(day - DATE_WINDOW_DAYS * DAY_MS).toISOString(),
    to: new Date(day + DATE_WINDOW_DAYS * DAY_MS).toISOString(),
  };
}

/** Which of name/hostName make `candidate` a likely duplicate of `event` — empty if none. */
export function findDuplicateMatchFields(event, candidate) {
  if (!isComparableCandidate(event, candidate)) {
    return [];
  }
  return COMPARED_FIELDS.filter((field) =>
    identifyingWordsMatch(identifyingWords(event[field]), identifyingWords(candidate[field])),
  );
}

/**
 * Same-tenant pairs are left out: a company re-creating its own event is a reschedule or its
 * own visible mistake, not one company double-billing a family another already serves.
 * Admin-created Events (no tenantId) count as a different owner from every tenant.
 */
function isComparableCandidate(event, candidate) {
  return (
    candidate.$id !== event.$id &&
    candidate.type === event.type &&
    (candidate.tenantId ?? null) !== (event.tenantId ?? null) &&
    datesWithinWindow(event.date, candidate.date)
  );
}

function datesWithinWindow(first, second) {
  return Math.abs(Date.parse(first) - Date.parse(second)) <= DATE_WINDOW_DAYS * DAY_MS;
}

/** NFKC/trim/whitespace/case-folded like identity screening, then split into kept words. */
export function identifyingWords(text) {
  const normalized = normalizeIdentity({ name: text }).name ?? '';
  const words = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return new Set(words.filter((word) => !IGNORED_WORDS.has(word)));
}

function identifyingWordsMatch(first, second) {
  const [smaller, larger] = first.size <= second.size ? [first, second] : [second, first];
  if (smaller.size === 0 || ![...smaller].every((word) => larger.has(word))) {
    return false;
  }
  return smaller.size === larger.size || smaller.size >= MIN_PARTIAL_MATCH_WORDS;
}
