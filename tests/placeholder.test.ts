import { describe, it, expect } from 'vitest';
import { getCoreVersion } from '../packages/core/src';

describe('Sweep Monorepo Baseline Test', () => {
  it('should export correct core version', () => {
    expect(getCoreVersion()).toBe('0.1.0');
  });
});
