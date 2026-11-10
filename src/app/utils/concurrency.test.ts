import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWithConcurrency } from './concurrency.ts';

test('never exceeds the concurrency limit and runs every item once', async () => {
  const items = Array.from({ length: 10 }, (_, index) => index);
  let active = 0;
  let peak = 0;
  const seen: number[] = [];

  await runWithConcurrency(items, 2, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    seen.push(item);
    active -= 1;
  });

  assert.equal(peak, 2);
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    items,
  );
});

test('handles an empty list and a limit above the item count', async () => {
  let calls = 0;
  await runWithConcurrency([], 2, async () => {
    calls += 1;
  });
  assert.equal(calls, 0);

  await runWithConcurrency([1, 2], 10, async () => {
    calls += 1;
  });
  assert.equal(calls, 2);
});
