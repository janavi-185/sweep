import fs from 'fs/promises';
import path from 'path';
import {
  ScanResult,
  ScanOptions,
  ProgressCallback,
  CategorySummary,
  FileCategory,
  FileEntry,
  DirectoryEntry,
} from '../types/index.js';
import { traverseDirectory } from './traverse.js';

export async function scanDirectory(
  targetPath: string,
  options: ScanOptions = {},
  onProgress?: ProgressCallback,
): Promise<ScanResult> {
  const startTime = Date.now();
  const resolvedPath = path.resolve(targetPath);

  // Check path existence
  try {
    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is a file, expected a directory: "${targetPath}"`);
    }
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ENOENT') {
      throw new Error(`Directory does not exist: "${targetPath}"`);
    }
    throw err;
  }

  const traversal = await traverseDirectory(resolvedPath, options, onProgress);
  const durationMs = Date.now() - startTime;

  // Aggregate category summaries
  const categoryMap: Map<FileCategory, { sizeBytes: number; fileCount: number }> = new Map();
  for (const cat of Object.values(FileCategory)) {
    categoryMap.set(cat as FileCategory, { sizeBytes: 0, fileCount: 0 });
  }

  for (const file of traversal.files) {
    const current = categoryMap.get(file.category) || { sizeBytes: 0, fileCount: 0 };
    current.sizeBytes += file.sizeBytes;
    current.fileCount += 1;
    categoryMap.set(file.category, current);
  }

  const categories: CategorySummary[] = [];
  for (const [category, stats] of categoryMap.entries()) {
    if (stats.fileCount > 0) {
      const percentage =
        traversal.totalSizeBytes > 0
          ? Number(((stats.sizeBytes / traversal.totalSizeBytes) * 100).toFixed(1))
          : 0;

      categories.push({
        category,
        sizeBytes: stats.sizeBytes,
        fileCount: stats.fileCount,
        percentage,
      });
    }
  }

  // Sort categories by total size descending
  categories.sort((a, b) => b.sizeBytes - a.sizeBytes);

  // Top 10 largest files
  const largestFiles: FileEntry[] = [...traversal.files]
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 10);

  // Top 10 largest directories
  const largestDirectories: DirectoryEntry[] = [...traversal.directories]
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 10);

  return {
    rootPath: resolvedPath,
    scannedAt: new Date(),
    durationMs,
    totalSizeBytes: traversal.totalSizeBytes,
    fileCount: traversal.fileCount,
    directoryCount: traversal.directoryCount,
    skippedCount: traversal.skippedCount,
    categories,
    largestFiles,
    largestDirectories,
    entries: traversal.entries,
  };
}

export * from './traverse.js';
export * from './metadata.js';
export * from './categorise.js';
