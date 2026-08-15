export * from './types';
export * from './rules';
export * from './scanner';
export * from './analyzer';
export * from './developer';

/**
 * Core engine stub for Sweep
 */
export function getCoreVersion(): string {
  return '0.1.0';
}
