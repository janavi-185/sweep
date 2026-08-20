import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  mapConcurrent,
  getOptimalConcurrency,
  scanDirectory,
  findDuplicates,
} from '../packages/core/src';

describe('Phase 9 — Concurrency & Performance Engine', () => {
  const testDir = path.join(os.tmpdir(), `sweep-concurrency-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(path.join(testDir, 'sub1/nested'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'sub2'), { recursive: true });

    const duplicateContent = 'A'.repeat(1024 * 1024 + 500); // > 1 MB
    fs.writeFileSync(path.join(testDir, 'sub1/file1.txt'), duplicateContent);
    fs.writeFileSync(path.join(testDir, 'sub2/file2.txt'), duplicateContent);
    fs.writeFileSync(path.join(testDir, 'sub1/nested/unique.txt'), 'unique content 123');
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('mapConcurrent processes all items concurrently within limit', async () => {
    const items = [10, 20, 30, 40, 50];
    const results = await mapConcurrent(items, 3, async (num) => num * 2);
    expect(results).toEqual([20, 40, 60, 80, 100]);
  });

  it('getOptimalConcurrency returns valid thread/concurrency count', () => {
    const limit = getOptimalConcurrency(8);
    expect(limit).toBeGreaterThanOrEqual(1);
    expect(limit).toBeLessThanOrEqual(8);
  });

  it('concurrent scanner accurately scans nested directories', async () => {
    const result = await scanDirectory(testDir);
    expect(result.fileCount).toBe(3);
    expect(result.directoryCount).toBe(3);
    expect(result.totalSizeBytes).toBeGreaterThan(2 * 1024 * 1024);
  });

  it('parallel hashing in duplicate finder pinpoints identical files', async () => {
    const dupesReport = await findDuplicates(testDir, { minSizeBytes: 1000000 });
    expect(dupesReport.duplicateGroupCount).toBe(1);
    expect(dupesReport.groups[0]!.files.length).toBe(2);
  });
});
