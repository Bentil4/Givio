import { Query, type Models, type TablesDB } from 'appwrite';
import { environment } from '../../../environments/environment';

const PAGE_SIZE = 100;
/** Appwrite caps the values a single Query.equal may carry at 100. */
const EVENT_IDS_PER_QUERY = 100;

/**
 * Every Donation row on these Events, straight from Appwrite: the ids split into batches of
 * 100, each batch paged through to the end. Row security decides which rows come back, so
 * callers pass only the Events they mean to read and map the rows to what they need.
 */
export async function listDonationRowsForEvents(
  databases: TablesDB,
  eventIds: readonly string[],
): Promise<Models.DefaultRow[]> {
  const batches = chunk(eventIds, EVENT_IDS_PER_QUERY);
  const pages = await Promise.all(batches.map((ids) => listDonationRows(databases, ids)));
  return pages.flat();
}

async function listDonationRows(
  databases: TablesDB,
  eventIds: string[],
): Promise<Models.DefaultRow[]> {
  const rows: Models.DefaultRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await databases.listRows<Models.DefaultRow>({
      databaseId: environment.appwriteDatabaseId,
      tableId: environment.donationsCollectionId,
      queries: donationQueries(eventIds, cursor),
    });
    rows.push(...page.rows);
    if (page.rows.length < PAGE_SIZE) {
      return rows;
    }
    cursor = page.rows[page.rows.length - 1].$id;
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

function donationQueries(eventIds: string[], cursor: string | undefined): string[] {
  const queries = [Query.equal('eventId', eventIds), Query.limit(PAGE_SIZE)];
  return cursor ? [...queries, Query.cursorAfter(cursor)] : queries;
}
