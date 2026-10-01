/**
 * Story 6.7's hook for Story 7.4 (AD-13): the one place a newly created tenant Event is handed
 * to the platform-wide duplicate-event check. Story 7.4 fills checkForDuplicateEvent in (e.g.
 * writing a DuplicateEventFlags row); until then it finds nothing. It runs after the Event row
 * exists and can never block or undo the creation — runDuplicateEventCheck swallows any
 * failure into the Function log.
 */
export async function runDuplicateEventCheck(context) {
  try {
    await checkForDuplicateEvent(context);
  } catch (err) {
    context.error(`duplicate-event check failed for ${context.event.$id}: ${err.message}`);
  }
}

// Receives { DatabasesCtor, adminClient, event, error } — the event as written.
async function checkForDuplicateEvent() {}
