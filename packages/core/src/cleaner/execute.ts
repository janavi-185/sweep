import fs from 'node:fs/promises';
import os from 'node:os';
import { CleanupCandidate, CleanupItemResult } from '@sweep/types';
import { matchesPattern } from './identify';

export async function deleteItem(
  candidate: CleanupCandidate,
  isDryRun = false,
): Promise<CleanupItemResult> {
  const resolvedPath = candidate.path.replace(/^~(?=$|\/)/, os.homedir());

  // 1. Safety Re-check: Path must match governing rule patterns
  const matchesSafety = candidate.rule.paths.some((pattern) =>
    matchesPattern(resolvedPath, pattern),
  );

  if (!matchesSafety) {
    return {
      candidate,
      actionTaken: 'failed',
      freedBytes: 0,
      error: 'Safety check failed: path pattern mismatch',
    };
  }

  // 2. Existence check
  try {
    await fs.access(resolvedPath);
  } catch {
    return {
      candidate,
      actionTaken: 'skipped',
      freedBytes: 0,
      error: 'Item no longer exists on disk',
    };
  }

  // 3. Dry-Run simulation
  if (isDryRun) {
    return {
      candidate,
      actionTaken: 'cleaned',
      freedBytes: candidate.sizeBytes,
    };
  }

  // 4. Execution
  try {
    await fs.rm(resolvedPath, { recursive: true, force: true });
    return {
      candidate,
      actionTaken: 'cleaned',
      freedBytes: candidate.sizeBytes,
    };
  } catch (err) {
    return {
      candidate,
      actionTaken: 'failed',
      freedBytes: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
