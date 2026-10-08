import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency, createTimeBudget } from '../src/bounded-work.js';

test('mapWithConcurrency returns results in input order', async () => {
  const results = await mapWithConcurrency([3, 1, 2], 2, async (n) => n * 10);

  assert.deepEqual(results, [30, 10, 20]);
});

test('mapWithConcurrency never exceeds the limit and does use all of it', async () => {
  let inFlight = 0;
  let peak = 0;

  await mapWithConcurrency([...Array(25).keys()], 10, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setImmediate(resolve));
    inFlight -= 1;
  });

  assert.equal(peak, 10);
});

test('mapWithConcurrency handles an empty list and a limit larger than the list', async () => {
  assert.deepEqual(await mapWithConcurrency([], 10, async (n) => n), []);
  assert.deepEqual(await mapWithConcurrency([1, 2], 10, async (n) => n + 1), [2, 3]);
});

test('mapWithConcurrency passes the index and rejects when a task rejects', async () => {
  const seen = [];
  await mapWithConcurrency(['a', 'b'], 1, async (item, index) => seen.push([item, index]));
  assert.deepEqual(seen, [
    ['a', 0],
    ['b', 1],
  ]);

  await assert.rejects(
    mapWithConcurrency([1], 1, async () => {
      throw new Error('boom');
    }),
    /boom/,
  );
});

test('createTimeBudget expires once the injected clock passes the budget', () => {
  let time = 1000;
  const budget = createTimeBudget({ now: () => time, budgetMs: 500 });

  assert.equal(budget.expired(), false);
  time = 1499;
  assert.equal(budget.expired(), false);
  time = 1500;
  assert.equal(budget.expired(), true);
});
