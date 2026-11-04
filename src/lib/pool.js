/**
 * Runs `worker` over `items` with at most `concurrency` tasks in flight.
 * `shouldStop()` is checked before each new item is started, so in-flight
 * tasks finish but no new work begins. Worker errors are the worker's job:
 * an uncaught throw is logged and the pool keeps going.
 */
export async function runPool(items, concurrency, worker, { shouldStop = () => false, onError = () => {} } = {}) {
  let next = 0;

  async function lane() {
    while (next < items.length && !shouldStop()) {
      const index = next;
      next += 1;
      try {
        await worker(items[index], index);
      } catch (err) {
        onError(err, items[index], index);
      }
    }
  }

  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, () => lane());
  await Promise.all(lanes);
}
