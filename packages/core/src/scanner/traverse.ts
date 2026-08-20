import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { FileEntry, DirectoryEntry, FsEntry, ScanOptions, ProgressCallback } from '../types';
import { categoriseFile } from './categorise';
import { getFileExtension, isHiddenPath } from './metadata';
import { mapConcurrent } from '../concurrency';

const NETWORK_TIMEOUT_MS = 5000;

async function readdirWithTimeout(dirPath: string): Promise<Dirent[]> {
  return Promise.race([
    fs.readdir(dirPath, { withFileTypes: true }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error('Directory read timeout'), { code: 'ETIMEDOUT' })),
        NETWORK_TIMEOUT_MS,
      ),
    ),
  ]);
}

export interface TraversalResult {
  entries: FsEntry[];
  files: FileEntry[];
  directories: DirectoryEntry[];
  totalSizeBytes: number;
  fileCount: number;
  directoryCount: number;
  skippedCount: number;
}

export async function traverseDirectory(
  rootPath: string,
  options: ScanOptions = {},
  onProgress?: ProgressCallback,
): Promise<TraversalResult> {
  const resolvedRoot = path.resolve(rootPath);
  const maxDepth = options.maxDepth;

  const files: FileEntry[] = [];
  const directories: DirectoryEntry[] = [];
  let skippedCount = 0;
  let scannedFileCount = 0;

  let lastProgressReportTime = 0;

  function reportProgress(currentPath: string) {
    const now = Date.now();
    if (onProgress && now - lastProgressReportTime > 200) {
      lastProgressReportTime = now;
      onProgress(scannedFileCount, currentPath);
    }
  }

  async function walk(currentPath: string, currentDepth: number): Promise<number> {
    if (maxDepth !== undefined && currentDepth > maxDepth) {
      return 0;
    }

    reportProgress(currentPath);

    let dirEntries: Dirent[];
    try {
      dirEntries = await readdirWithTimeout(currentPath);
    } catch {
      skippedCount++;
      return 0;
    }

    let dirTotalSize = 0;

    const sizes = await mapConcurrent(dirEntries, 64, async (dirEnt) => {
      const fullPath = path.join(currentPath, dirEnt.name);
      const isHidden = isHiddenPath(fullPath);

      if (options.includeHidden === false && isHidden) {
        return 0;
      }

      try {
        const lstat = await fs.lstat(fullPath);

        if (lstat.isSymbolicLink()) {
          if (lstat.isDirectory()) {
            const symlinkDirEntry: DirectoryEntry = {
              path: fullPath,
              name: dirEnt.name,
              sizeBytes: lstat.size,
              fileCount: 0,
              isHidden,
              isSymlink: true,
              isDirectory: true,
            };
            directories.push(symlinkDirEntry);
            return lstat.size;
          } else {
            const ext = getFileExtension(dirEnt.name);
            const category = categoriseFile(fullPath, ext);
            const symlinkFileEntry: FileEntry = {
              path: fullPath,
              name: dirEnt.name,
              extension: ext,
              sizeBytes: lstat.size,
              modifiedAt: lstat.mtime,
              isDirectory: false,
              category,
              isHidden,
              isSymlink: true,
            };
            files.push(symlinkFileEntry);
            scannedFileCount++;
            return lstat.size;
          }
        } else if (lstat.isDirectory()) {
          const subDirSize = await walk(fullPath, currentDepth + 1);
          const dirEntry: DirectoryEntry = {
            path: fullPath,
            name: dirEnt.name,
            sizeBytes: subDirSize,
            fileCount: scannedFileCount,
            isHidden,
            isSymlink: false,
            isDirectory: true,
          };
          directories.push(dirEntry);
          return subDirSize;
        } else if (lstat.isFile()) {
          const ext = getFileExtension(dirEnt.name);
          const category = categoriseFile(fullPath, ext);
          const fileEntry: FileEntry = {
            path: fullPath,
            name: dirEnt.name,
            extension: ext,
            sizeBytes: lstat.size,
            modifiedAt: lstat.mtime,
            isDirectory: false,
            category,
            isHidden,
            isSymlink: false,
          };
          files.push(fileEntry);
          scannedFileCount++;
          reportProgress(fullPath);
          return lstat.size;
        }
      } catch {
        skippedCount++;
      }
      return 0;
    });

    for (const size of sizes) {
      dirTotalSize += size;
    }

    return dirTotalSize;
  }

  const rootLstat = await fs.lstat(resolvedRoot);
  if (!rootLstat.isDirectory()) {
    throw new Error(`Expected a directory path, got a file: ${resolvedRoot}`);
  }

  const totalSizeBytes = await walk(resolvedRoot, 0);

  if (onProgress) {
    onProgress(scannedFileCount, resolvedRoot);
  }

  const entries: FsEntry[] = [...files, ...directories];

  return {
    entries,
    files,
    directories,
    totalSizeBytes,
    fileCount: files.length,
    directoryCount: directories.length,
    skippedCount,
  };
}
