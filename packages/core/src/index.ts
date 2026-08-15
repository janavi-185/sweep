export * from './types';
export * from './rules';
export * from './scanner';
export * from './analyzer';
export * from './developer';
export * from './cleaner';
export * from './duplicates';
export * from './cache';

/**
 * Core engine stub for Sweep
 */
export function getCoreVersion(): string {
  return '0.1.0';
}
