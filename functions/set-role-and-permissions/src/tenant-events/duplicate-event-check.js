import { Query } from 'node-appwrite';
import { listAllRows } from '../shared.js';
import {
  candidateDateRange,
  findDuplicateMatchFields,
} from '../duplicate-events/duplicate-matching.js';
import {
  duplicateFlagTables,
  isDuplicateFlagTableConfigured,
  writeDuplicateFlag,
} from '../duplicate-events/flag-store.js';

const CANDIDATE_COLUMNS = ['$id', 'name', 'hostName', 'type', 'date', 'tenantId'];

/**
 * Story 6.7's hook for Story 7.4 (AD-13): the one place a newly created tenant Event is handed
 * to the platform-wide duplicate-event check. It runs after the Event row exists and can never
 * block or undo the creation — runDuplicateEventCheck swallows any failure into the Function
 * log, and an environment without the flags table just skips the check.
 */
export async function runDuplicateEventCheck(context) {
  try {
    await checkForDuplicateEvent(context);
  } catch (err) {
    context.error(`duplicate-event check failed for ${context.event.$id}: ${err.message}`);
  }
}

// Receives { DatabasesCtor, adminClient, event, error } — the event as written.
async function checkForDuplicateEvent(context) {
  if (!isDuplicateFlagTableConfigured()) {
    context.error(`duplicate-event check skipped for ${context.event.$id}: no flags table`);
    return;
  }
  const candidates = await listCandidateEvents(context);
  const matches = candidates
    .map((candidate) => ({
      candidate,
      matchedOn: findDuplicateMatchFields(context.event, candidate),
    }))
    .filter((match) => match.matchedOn.length > 0);
  await Promise.all(matches.map((match) => writeDuplicateFlag({ ...context, match })));
}

/**
 * Every tenant's Events (and Admin's) of the same type in the date window — read with the
 * Function's API key, the only cross-tenant reach there is. Backed by the events table's
 * (type, date) index, so a create never scans the whole table.
 */
function listCandidateEvents({ DatabasesCtor, adminClient, event }) {
  const { databaseId, eventsTableId } = duplicateFlagTables();
  const { from, to } = candidateDateRange(event.date);
  return listAllRows({
    DatabasesCtor,
    adminClient,
    databaseId,
    tableId: eventsTableId,
    queries: [
      Query.equal('type', [event.type]),
      Query.between('date', from, to),
      Query.notEqual('$id', event.$id),
      Query.select(CANDIDATE_COLUMNS),
    ],
  });
}
