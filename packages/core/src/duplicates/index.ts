import path from 'node:path';
import os from 'node:os';
import { DuplicateReport, FindDuplicatesOptions } from '@sweep/types';
import { traverseDirectory } from '../scanner/traverse';
import { groupBySize } from './group-by-size';
import { hashFiles } from './hash-files';
import { buildReport } from './report';

export async function findDuplicates(
  targetPath: string,
  options: FindDuplicatesOptions = {},
): Promise<DuplicateReport> {
  const startTime = Date.now();
  const resolvedPath = path.resolve(targetPath.replace(/^~(?=$|\/)/, os.homedir()));
  const minSizeBytes = options.minSizeBytes ?? 1_048_576; // Default: 1 MB

  const traversalResult = await traverseDirectory(resolvedPath);
  const fileEntries = traversalResult.files;

  // Pass 1: Group by size
  const candidateSizeGroups = groupBySize(fileEntries, minSizeBytes);

  let filesHashed = 0;
  for (const files of candidateSizeGroups.values()) {
    filesHashed += files.length;
  }

  // Pass 2: Hash by content
  const hashGroups = await hashFiles(candidateSizeGroups, options.onProgress);

  const durationMs = Date.now() - startTime;

  return buildReport(resolvedPath, hashGroups, {
    filesScanned: fileEntries.filter((f) => f.sizeBytes >= minSizeBytes).length,
    filesHashed,
    durationMs,
  });
}

export * from './group-by-size';
export * from './hash-files';
export * from './report';
export * from './format';
