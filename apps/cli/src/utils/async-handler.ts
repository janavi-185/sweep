import { print } from './output';

export function createAsyncHandler<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T): Promise<void> => {
    try {
      await fn(...args);
    } catch (err) {
      print.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  };
}
