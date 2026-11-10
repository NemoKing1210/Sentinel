/**
 * Run async work over `items` with at most `limit` workers. Items are claimed
 * from a shared index, so a slow item does not block the others and every
 * item runs exactly once.
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;

  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  };

  await Promise.all(Array.from({ length: width }, run));
}
