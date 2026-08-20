import os from 'node:os';

/**
 * Bounded Concurrency Helper
 * Executes tasks concurrently up to a specified limit.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrencyLimit: number,
  taskFn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await taskFn(items[index]!);
    }
  };

  const workerCount = Math.min(concurrencyLimit, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Returns optimal worker concurrency based on available CPU cores.
 */
export function getOptimalConcurrency(maxLimit = 8): number {
  const cpus = os.cpus().length || 4;
  return Math.max(1, Math.min(cpus - 1, maxLimit));
}
