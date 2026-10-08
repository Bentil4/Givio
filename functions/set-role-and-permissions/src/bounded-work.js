// The Function is killed at 30 s, so a long sweep stops itself a little earlier and reports
// what is left, letting the caller answer "retry to finish" instead of timing out mid-write.
export const DEFAULT_TIME_BUDGET_MS = 24_000;

/** Runs `fn` over `items` with at most `limit` in flight; resolves results in input order. */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

/** A wall-clock deadline; `now` is injectable so tests control time. */
export function createTimeBudget({ now = Date.now, budgetMs = DEFAULT_TIME_BUDGET_MS } = {}) {
  const deadline = now() + budgetMs;
  return { expired: () => now() >= deadline };
}
